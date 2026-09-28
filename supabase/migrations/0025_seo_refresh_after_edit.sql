-- 0025_seo_refresh_after_edit.sql
-- seo_title i seo_description powstaja z tytulu i leadu (GENERATE_SEO). Po poprawce redaktora
-- zostawaly stare i trafialy do <title>, OG i JSON-LD. Zmiana tytulu albo leadu w
-- save_article_edit czysci teraz oba pola i w tej samej transakcji kolejkuje GENERATE_SEO
-- w trybie odswiezenia. Puste pola SEO blokuja Publikuj (publishBlockers), dopoki job ich
-- nie uzupelni. Edycja samej tresci niczego nie kolejkuje.

-- Redaktor nie ma polityki insert na jobs, a enqueue_job dziala jako invoker, wiec
-- kolejkowanie idzie przez waski helper z uprawnieniami wlasciciela: tylko GENERATE_SEO,
-- tylko dla artykulu w review z pustym SEO, ze stalym dedupe_key. Dwie edycje przed
-- przetworzeniem joba daja jeden job; handler czyta aktualny tytul i lead przy uruchomieniu.
-- Zwraca id joba albo null, gdy nie ma czego odswiezac lub job o tym kluczu czeka w kolejce.
create or replace function enqueue_seo_refresh(p_article_id uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_job_id uuid;
  v_dedupe_key text := 'GENERATE_SEO:refresh:' || p_article_id::text;
begin
  if not public.is_editor() then
    raise exception 'Tylko redaktor moze odswiezyc SEO artykulu'
      using errcode = 'insufficient_privilege';
  end if;

  select story_id
  into v_story_id
  from public.articles
  where id = p_article_id
    and status = 'review'
    and (seo_title is null or seo_description is null);

  if not found then
    return null;
  end if;

  -- Job w toku pracuje na wersji sprzed tej edycji: mogl juz zapisac jej SEO i czekac na
  -- complete_job, a wtedy konflikt klucza zgubilby odswiezenie. Odpiety od klucza nie
  -- blokuje nowego joba. Jego zapis warunkowy nie przejdzie (tytul lub lead sie zmienil),
  -- a ponowienie bez klucza odswiezenia konczy sie w handlerze bez pracy.
  -- Martwy job odpinamy z tego samego powodu: indeks unikalny go pomija, ale requeue_dead_job
  -- przywrocilby go do queued obok nowego joba z tym kluczem i skonczyl sie bledem 23505.
  update public.jobs
  set dedupe_key = null
  where dedupe_key = v_dedupe_key
    and status in ('running', 'dead');

  -- Insert jak w enqueue_job (0012). Tamta funkcja nie ma wlasnego search_path i przy
  -- pustej sciezce tej funkcji nie znalazlaby tabeli jobs.
  insert into public.jobs (type, payload, dedupe_key, story_id, article_id)
  values (
    'GENERATE_SEO',
    jsonb_build_object('articleId', p_article_id),
    v_dedupe_key,
    v_story_id,
    p_article_id
  )
  on conflict (dedupe_key) where dedupe_key is not null and status in ('queued', 'running', 'failed')
  do nothing
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function enqueue_seo_refresh(uuid) from public, anon;
grant execute on function enqueue_seo_refresh(uuid) to authenticated;

-- Logika z 0020 bez zmian poza czyszczeniem SEO i kolejkowaniem odswiezenia.
create or replace function save_article_edit(
  p_article_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_lead text,
  p_content jsonb
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

  select title, lead, content, status, updated_at
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
    and v_current.content = p_content then
    return v_current.updated_at;
  end if;

  v_seo_stale := v_current.title is distinct from p_title
    or v_current.lead is distinct from p_lead;

  insert into public.article_revisions (article_id, title, lead, content, edited_by)
  values (p_article_id, v_current.title, v_current.lead, v_current.content, auth.uid());

  update public.articles
  set title = p_title,
      lead = p_lead,
      content = p_content,
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

revoke all on function save_article_edit(uuid, timestamptz, text, text, jsonb) from public, anon;
grant execute on function save_article_edit(uuid, timestamptz, text, text, jsonb) to authenticated;

-- Po edycji tytulu lub leadu SEO jest puste, dopoki job go nie odswiezy. Panel blokuje wtedy
-- Publikuj (publishBlockers), a baza odrzuca publikacje z pustym SEO tak samo jak bez leadu
-- (23502), zeby wywolanie RPC z pominieciem panelu nie opublikowalo artykulu bez metadanych.
-- Logika z 0021 bez zmian poza tym warunkiem.
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
    and coalesce(btrim(seo_title), '') <> ''
    and coalesce(btrim(seo_description), '') <> ''
  into v_ready
  from public.articles
  where id = p_article_id;

  if v_ready is not true then
    raise exception 'Artykul % nie ma leadu, kategorii, tresci albo metadanych SEO', p_article_id
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
