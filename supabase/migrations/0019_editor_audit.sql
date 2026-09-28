-- 0019_editor_audit.sql
-- Audyt akcji redakcji z sesji uzytkownika i ponawianie martwych jobow z panelu.
-- audit_log nie ma polityki insert: zapisuja do niego wylacznie triggery
-- security definer, wiec redaktor nie moze dopisac ani podrobic wpisu.

-- Wersja z 0013 dzialala jako invoker i publikacja z sesji redaktora padala na RLS.
-- Aktorem jest najpierw uzytkownik sesji: approved_by zostaje po wczesniejszej
-- akceptacji i przypisalby archiwizacje lub odrzucenie niewlasciwej osobie.
create or replace function log_article_status_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
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

  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
  values (
    coalesce(auth.uid(), new.approved_by),
    v_action,
    'article',
    new.id,
    jsonb_build_object('from', old.status, 'to', new.status)
  );

  return new;
end;
$$;

-- Rewizje modelu (edited_by is null) nie sa akcja redakcji i nie trafiaja do audytu.
create or replace function log_article_revision() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
  values (
    new.edited_by,
    'edit',
    'article',
    new.article_id,
    jsonb_build_object('revision_id', new.id)
  );

  return new;
end;
$$;

create trigger article_revisions_audit_edit
after insert on article_revisions
for each row
when (new.edited_by is not null)
execute function log_article_revision();

-- fetch-source przy kazdym pobraniu zapisuje active z ta sama wartoscia,
-- dlatego trigger reaguje tylko na rzeczywista zmiane pol konfiguracyjnych.
-- actor_id jest null, gdy zrodlo wylaczyl circuit breaker w pipelinie.
create or replace function log_source_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_diff jsonb := '{}'::jsonb;
begin
  if old.active is distinct from new.active then
    v_diff := v_diff || jsonb_build_object('active', jsonb_build_object('from', old.active, 'to', new.active));
  end if;

  if old.trust_score is distinct from new.trust_score then
    v_diff := v_diff || jsonb_build_object(
      'trust_score',
      jsonb_build_object('from', old.trust_score, 'to', new.trust_score)
    );
  end if;

  if old.rss_url is distinct from new.rss_url then
    v_diff := v_diff || jsonb_build_object('rss_url', jsonb_build_object('from', old.rss_url, 'to', new.rss_url));
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
  values (auth.uid(), 'source_change', 'source', new.id, v_diff);

  return new;
end;
$$;

create trigger sources_audit_change
after update on sources
for each row
when (
  old.active is distinct from new.active
  or old.trust_score is distinct from new.trust_score
  or old.rss_url is distinct from new.rss_url
)
execute function log_source_change();

-- Ponowienie pojedynczego martwego joba z panelu. Na jobs nie ma polityki update,
-- wiec funkcja dziala jako definer i sama sprawdza role.
create or replace function requeue_dead_job(p_job_id uuid) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Tylko administrator moze ponowic martwy job'
      using errcode = 'insufficient_privilege';
  end if;

  update public.jobs
  set status = 'queued',
      attempts = 0,
      error = null,
      next_run_at = now(),
      locked_at = null,
      locked_by = null
  where id = p_job_id
    and status = 'dead';

  return found;
end;
$$;

revoke all on function requeue_dead_job(uuid) from public, anon;
grant execute on function requeue_dead_job(uuid) to authenticated, service_role;

-- Masowe ponawianie zostaje narzedziem operacyjnym: worker i skrypty na service_role.
revoke all on function requeue_dead_jobs(job_type) from public, anon, authenticated;
grant execute on function requeue_dead_jobs(job_type) to service_role;
