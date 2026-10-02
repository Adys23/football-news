-- 0027_article_images_guard.sql
-- Obrazy w artykulach. Zasada: obraz trafia do artykulu wylacznie z image_assets, z licencja
-- i nie wygenerowany przez AI. is_ai_generated zostaje flaga audytowa w bibliotece; blokada
-- dziala przy uzyciu obrazu w artykule, a nie przy samym zapisie w image_assets.
--
-- 1. enforce_article_images (articles): hero musi istniec, miec kind = 'hero' i nie byc AI;
--    kazdy imageId z blokow image w content musi istniec i nie byc AI. imageId to JSON, nie FK,
--    wiec bez triggera blok moglby wskazywac dowolny uuid. Sprawdzamy tylko odwolania dodane
--    w tym zapisie: istniejace pilnuje trigger na image_assets, a ponowne sprawdzanie calej
--    tresci blokowaloby niezwiazane edycje. Trigger dziala tez dla service_role (pipeline).
-- 2. protect_used_image_assets (image_assets): obrazu uzytego w artykule nie da sie oznaczyc
--    jako AI ani (dla hero) zmienic na inny kind, a obrazu uzytego w bloku nie da sie usunac
--    (hero ma on delete set null, blok zostalby z imageId bez obrazu).
-- 3. article_revisions.hero_image_id i save_article_edit z p_hero_image_id: redaktor zmienia
--    hero ta sama sciezka co tresc, a rewizja zapisuje hero sprzed zmiany.
--
-- Kod bledu 23514 (check_violation) dla obrazu spoza zasad, 23503 dla usuniecia uzytego obrazu.

-- Identyfikatory obrazow z blokow image. Tresc spoza kontraktu (brak imageId, zly uuid)
-- odrzuca zod przed zapisem; tu interesuja nas tylko poprawne odwolania.
create or replace function article_block_image_ids(p_content jsonb) returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct (b ->> 'imageId')::uuid), '{}')
  from jsonb_array_elements(
    case when jsonb_typeof(p_content -> 'blocks') = 'array' then p_content -> 'blocks' else '[]'::jsonb end
  ) as b
  where b ->> 'type' = 'image'
    and b ->> 'imageId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

comment on function article_block_image_ids(jsonb) is 'Identyfikatory obrazow z blokow image w articles.content.';

create or replace function enforce_article_images() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_ids uuid[];
  v_bad_id uuid;
begin
  if new.hero_image_id is not null
    and (tg_op = 'INSERT' or new.hero_image_id is distinct from old.hero_image_id) then
    -- for share: rownolegla zmiana obrazu czeka na koniec tej transakcji, a potem
    -- image_assets_protect_used widzi juz ten artykul.
    perform 1
    from public.image_assets i
    where i.id = new.hero_image_id
      and i.kind = 'hero'
      and not i.is_ai_generated
    for share;

    if not found then
      raise exception 'Obraz % nie moze byc obrazem glownym artykulu: brak w bibliotece, inny rodzaj niz hero albo obraz AI', new.hero_image_id
        using errcode = 'check_violation';
    end if;
  end if;

  v_new_ids := public.article_block_image_ids(new.content);
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(u.image_id), '{}')
    into v_new_ids
    from unnest(v_new_ids) as u (image_id)
    where u.image_id <> all (public.article_block_image_ids(old.content));
  end if;

  perform 1
  from public.image_assets i
  where i.id = any (v_new_ids)
  for share;

  select u.image_id
  into v_bad_id
  from unnest(v_new_ids) as u (image_id)
  where not exists (
    select 1
    from public.image_assets i
    where i.id = u.image_id
      and not i.is_ai_generated
  )
  limit 1;

  if v_bad_id is not null then
    raise exception 'Blok image wskazuje obraz %, ktorego nie ma w bibliotece albo ktory jest obrazem AI', v_bad_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger articles_enforce_images
before insert or update of hero_image_id, content on articles
for each row
execute function enforce_article_images();

create or replace function protect_used_image_assets() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used_as_hero boolean;
  v_used_in_blocks boolean;
begin
  select exists (select 1 from public.articles a where a.hero_image_id = old.id)
  into v_used_as_hero;

  -- Pelny przeglad tresci: biblioteka zmienia sie rzadko, a artykulow jest niewiele.
  select exists (
    select 1
    from public.articles a
    where old.id = any (public.article_block_image_ids(a.content))
  )
  into v_used_in_blocks;

  if tg_op = 'DELETE' then
    if v_used_in_blocks then
      raise exception 'Obraz % jest uzyty w tresci artykulu, usun najpierw blok', old.id
        using errcode = 'foreign_key_violation';
    end if;
    return old;
  end if;

  if new.is_ai_generated and (v_used_as_hero or v_used_in_blocks) then
    raise exception 'Obraz % jest uzyty w artykule i nie moze zostac oznaczony jako AI', old.id
      using errcode = 'check_violation';
  end if;

  if new.kind <> 'hero' and v_used_as_hero then
    raise exception 'Obraz % jest obrazem glownym artykulu i musi zostac hero', old.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger image_assets_protect_used
before update of is_ai_generated, kind or delete on image_assets
for each row
execute function protect_used_image_assets();

-- Rewizja zapisuje hero sprzed zmiany. Usuniecie obrazu nie usuwa historii edycji.
alter table article_revisions
  add column hero_image_id uuid references image_assets (id) on delete set null;

-- Nowa sygnatura: stara (5 argumentow) znika, zeby panel nie mogl zapisac tresci z pominieciem
-- hero. p_hero_image_id nie ma wartosci domyslnej: null znaczy "bez obrazu", a nie "bez zmian".
-- Logika z 0025 bez zmian poza hero w porownaniu, w snapshocie i w update. Zmiana samego hero
-- nie czysci SEO.
drop function save_article_edit(uuid, timestamptz, text, text, jsonb);

create function save_article_edit(
  p_article_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_lead text,
  p_content jsonb,
  p_hero_image_id uuid
) returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_current record;
  v_updated_at timestamptz;
  v_seo_stale boolean;
begin
  if not public.is_editor() then
    raise exception 'Tylko redaktor moze edytowac artykul'
      using errcode = 'insufficient_privilege';
  end if;

  select title, lead, content, hero_image_id, status, updated_at
  into v_current
  from public.articles
  where id = p_article_id
  for update;

  if not found then
    raise exception 'Artykul % nie istnieje', p_article_id
      using errcode = 'no_data_found';
  end if;

  if v_current.status <> 'review' then
    raise exception 'Artykul % ma status %, edytowac mozna tylko review', p_article_id, v_current.status
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'Artykul % zostal zmieniony po otwarciu formularza', p_article_id
      using errcode = 'serialization_failure';
  end if;

  -- Zapis bez zmian nie jest edycja: brak rewizji i wpisu w audit_log.
  if v_current.title = p_title
    and v_current.lead is not distinct from p_lead
    and v_current.content = p_content
    and v_current.hero_image_id is not distinct from p_hero_image_id then
    return v_current.updated_at;
  end if;

  v_seo_stale := v_current.title is distinct from p_title
    or v_current.lead is distinct from p_lead;

  insert into public.article_revisions (article_id, title, lead, content, hero_image_id, edited_by)
  values (p_article_id, v_current.title, v_current.lead, v_current.content, v_current.hero_image_id, auth.uid());

  update public.articles
  set title = p_title,
      lead = p_lead,
      content = p_content,
      hero_image_id = p_hero_image_id,
      seo_title = case when v_seo_stale then null else seo_title end,
      seo_description = case when v_seo_stale then null else seo_description end
  where id = p_article_id
  returning updated_at into v_updated_at;

  if v_seo_stale then
    perform public.enqueue_seo_refresh(p_article_id);
  end if;

  return v_updated_at;
end;
$$;

revoke all on function save_article_edit(uuid, timestamptz, text, text, jsonb, uuid) from public, anon;
grant execute on function save_article_edit(uuid, timestamptz, text, text, jsonb, uuid) to authenticated;
