-- 0021_publish_reject_article.sql
-- Decyzja redaktora z panelu: publikacja albo odrzucenie artykulu w jednej transakcji
-- z aktualizacja statusu historii. Wpis w audit_log robi trigger articles_audit_status,
-- funkcje go nie dubluja.
--
-- Funkcje dzialaja jako invoker, wiec obowiazuja polityki RLS redaktora, a trigger
-- enforce_publish_guard nadal blokuje publikacje bez approved_by i z twierdzeniami
-- bez podparcia w faktach (23514).
--
-- Kody bledow dla panelu:
--   42501 - brak roli redaktora,
--   P0002 - artykul nie istnieje,
--   55000 - artykul nie jest w statusie review ani approved,
--   40001 - ktos zmienil artykul po otwarciu widoku (p_expected_updated_at),
--   23502 - publikacja bez leadu, kategorii albo tresci,
--   22023 - ocena automatyczna jest sprzed edycji redaktora, a publikacja nie ma potwierdzenia,
--   22001 - powod odrzucenia dluzszy niz 500 znakow.

-- Powod decyzji przekazuje do triggera ustawienie transakcyjne app.status_change_reason.
-- Kolumny na powod nie ma, a audit_log nie ma polityki insert, wiec to jedyna droga
-- bez drugiego wpisu. Zmiany z pipeline'u ustawienia nie maja i diff sie nie zmienia.
create or replace function log_article_status_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_diff jsonb;
  v_reason text := nullif(current_setting('app.status_change_reason', true), '');
begin
  if new.status = old.status then
    return new;
  end if;

  v_action := case new.status
    when 'published' then 'publish'
    when 'approved' then 'approve'
    when 'rejected' then 'reject'
    when 'archived' then 'archive'
    else 'edit'
  end;

  v_diff := jsonb_build_object('from', old.status, 'to', new.status);
  if v_reason is not null then
    v_diff := v_diff || jsonb_build_object('reason', v_reason);
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
  values (
    coalesce(auth.uid(), new.approved_by),
    v_action,
    'article',
    new.id,
    v_diff
  );

  return new;
end;
$$;

-- Guard z 0011 bez wlasnego search_path szukal article_scores w sciezce wywolujacego,
-- a funkcje z search_path = '' (jak ponizsze) konczyly sie bledem 42P01.
-- Logika bez zmian, tylko kwalifikowane nazwy.
create or replace function enforce_publish_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' then
    if new.approved_by is null then
      raise exception 'Artykul % nie moze zostac opublikowany bez akceptacji redaktora', new.id
        using errcode = 'check_violation';
    end if;

    if exists (
      select 1
      from public.article_scores s
      where s.article_id = new.id
        and s.unsupported_claims > 0
    ) then
      raise exception 'Artykul % zawiera twierdzenia bez podparcia w faktach', new.id
        using errcode = 'check_violation';
    end if;

    new.published_at := coalesce(new.published_at, now());
  end if;

  return new;
end;
$$;

-- Wspolna czesc obu decyzji: rola, blokada wiersza, status i wersja widziana przez redaktora.
-- Zwraca id historii artykulu.
create or replace function lock_article_for_decision(
  p_article_id uuid,
  p_expected_updated_at timestamptz
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_article record;
begin
  if not public.is_editor() then
    raise exception 'Tylko redaktor moze publikowac i odrzucac artykuly'
      using errcode = 'insufficient_privilege';
  end if;

  select story_id, status, updated_at
  into v_article
  from public.articles
  where id = p_article_id
  for update;

  if not found then
    raise exception 'Artykul % nie istnieje', p_article_id
      using errcode = 'no_data_found';
  end if;

  if v_article.status not in ('review', 'approved') then
    raise exception 'Artykul % ma status %, decyzja dotyczy tylko review i approved', p_article_id, v_article.status
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_article.updated_at is distinct from p_expected_updated_at then
    raise exception 'Artykul % zostal zmieniony po otwarciu widoku', p_article_id
      using errcode = 'serialization_failure';
  end if;

  return v_article.story_id;
end;
$$;

revoke all on function lock_article_for_decision(uuid, timestamptz) from public, anon;
grant execute on function lock_article_for_decision(uuid, timestamptz) to authenticated;

-- Autorem publikowanego tekstu jest realna osoba z redakcji: gdy pipeline nie przypisal
-- autora, zostaje nim profil autora redaktora, ktory publikuje (o ile go ma).
--
-- Edycja redaktora nie uruchamia ponownie oceny modelu, wiec article_scores moze dotyczyc
-- wersji sprzed edycji. Wtedy publikacja wymaga jawnego potwierdzenia (p_confirm_stale_score),
-- a audit_log dostaje powod z informacja, ze ocena byla nieaktualna.
create or replace function publish_article(
  p_article_id uuid,
  p_expected_updated_at timestamptz,
  p_confirm_stale_score boolean default false
) returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_ready boolean;
  v_stale_score boolean;
  v_published_at timestamptz;
begin
  v_story_id := public.lock_article_for_decision(p_article_id, p_expected_updated_at);

  -- blocks jest zawsze tablica (articles_content_has_blocks).
  select coalesce(btrim(lead), '') <> ''
    and category_id is not null
    and jsonb_array_length(content -> 'blocks') > 0
  into v_ready
  from public.articles
  where id = p_article_id;

  if v_ready is not true then
    raise exception 'Artykul % nie ma leadu, kategorii albo tresci', p_article_id
      using errcode = 'not_null_violation';
  end if;

  select exists (
    select 1
    from public.article_revisions r
    join public.article_scores s on s.article_id = r.article_id
    where r.article_id = p_article_id
      and r.edited_by is not null
      and r.created_at > s.checked_at
  )
  into v_stale_score;

  if v_stale_score and p_confirm_stale_score is not true then
    raise exception 'Ocena artykulu % jest sprzed edycji redaktora, publikacja wymaga potwierdzenia', p_article_id
      using errcode = 'invalid_parameter_value';
  end if;

  if v_stale_score then
    perform set_config('app.status_change_reason', 'Publikacja z ocena automatyczna sprzed edycji redaktora', true);
  end if;

  update public.articles
  set status = 'published',
      approved_by = auth.uid(),
      published_at = coalesce(published_at, now()),
      author_id = coalesce(
        author_id,
        (select a.id from public.authors a where a.profile_id = auth.uid() order by a.created_at limit 1)
      )
  where id = p_article_id
  returning published_at into v_published_at;

  perform set_config('app.status_change_reason', '', true);

  update public.stories
  set status = 'published'
  where id = v_story_id;

  return v_published_at;
end;
$$;

revoke all on function publish_article(uuid, timestamptz, boolean) from public, anon;
grant execute on function publish_article(uuid, timestamptz, boolean) to authenticated;

create or replace function reject_article(
  p_article_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text default null
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if char_length(v_reason) > 500 then
    raise exception 'Powod odrzucenia moze miec najwyzej 500 znakow'
      using errcode = 'string_data_right_truncation';
  end if;

  v_story_id := public.lock_article_for_decision(p_article_id, p_expected_updated_at);

  perform set_config('app.status_change_reason', coalesce(v_reason, ''), true);

  update public.articles
  set status = 'rejected'
  where id = p_article_id;

  perform set_config('app.status_change_reason', '', true);

  update public.stories
  set status = 'rejected'
  where id = v_story_id;
end;
$$;

revoke all on function reject_article(uuid, timestamptz, text) from public, anon;
grant execute on function reject_article(uuid, timestamptz, text) to authenticated;
