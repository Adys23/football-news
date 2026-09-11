-- 0013_settings_audit.sql
-- Konfiguracja runtime bez deployu oraz slad decyzji redakcyjnych.

create table settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id) on delete set null
);

alter table settings enable row level security;

comment on table settings is 'Progi, limity i przelaczniki pipeline''u. Zmiana nie wymaga deployu.';

create trigger settings_set_updated_at
before update on settings
for each row
execute function set_updated_at();

insert into settings (key, value, description) values
  ('pipeline_enabled', 'true'::jsonb, 'Globalny wylacznik pipeline''u. false zatrzymuje kolejkowanie nowych jobow.'),
  ('auto_publish_enabled', 'false'::jsonb, 'W MVP zawsze false. Publikacja wymaga akceptacji redaktora.'),
  ('quality_threshold', '0.90'::jsonb, 'Prog jakosci dla szybkiej sciezki w panelu.'),
  ('clickbait_threshold', '0.10'::jsonb, 'Powyzej tej wartosci artykul nie trafia do kolejki redaktora.'),
  ('min_fact_confidence', '0.60'::jsonb, 'Fakty ponizej tego progu nie sa zapisywane.'),
  ('escalation_confidence', '0.80'::jsonb, 'Ponizej tej wartosci etap uzywa mocniejszego modelu.'),
  ('max_articles_per_hour', '12'::jsonb, 'Bezpiecznik przed masowa produkcja tresci.'),
  ('model_default', '"gpt-5.6-luna"'::jsonb, 'Model domyslny dla wiekszosci etapow.'),
  ('model_escalation', '"gpt-5.6-sol"'::jsonb, 'Model do trudnych przypadkow i sprzecznych zrodel.'),
  ('daily_llm_budget_usd', '15'::jsonb, 'Po przekroczeniu dispatcher przestaje kolejkowac joby LLM.'),
  ('dedupe_similarity_threshold', '0.55'::jsonb, 'Prog podobienstwa tytulow w deduplikacji.'),
  ('dedupe_window_hours', '48'::jsonb, 'Okno czasowe dopasowywania zrodel do historii.')
on conflict (key) do nothing;

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  diff jsonb,
  created_at timestamptz not null default now(),
  constraint audit_log_action_known check (
    action in (
      'approve', 'reject', 'edit', 'publish', 'unpublish', 'archive',
      'source_change', 'settings_change', 'story_merge', 'story_split'
    )
  )
);

alter table audit_log enable row level security;

create index audit_log_entity_idx on audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx on audit_log (actor_id, created_at desc);

-- Kazda zmiana statusu artykulu zostawia slad. Trigger, a nie kod aplikacji,
-- bo slad musi powstac niezaleznie od tego, ktora sciezka zmienila status.
create or replace function log_article_status_change() returns trigger
language plpgsql
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

  insert into audit_log (actor_id, action, entity_type, entity_id, diff)
  values (
    coalesce(new.approved_by, auth.uid()),
    v_action,
    'article',
    new.id,
    jsonb_build_object('from', old.status, 'to', new.status)
  );

  return new;
end;
$$;

create trigger articles_audit_status
after update of status on articles
for each row
execute function log_article_status_change();
