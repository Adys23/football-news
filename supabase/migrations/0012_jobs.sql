-- 0012_jobs.sql
-- Kolejka zadan w Postgresie. W MVP to wystarcza i eliminuje osobna infrastrukture.
-- Kazdy etap pipeline'u konczy sie zapisem do bazy i zakolejkowaniem nastepnego joba,
-- wiec blad jednego etapu nie niszczy calego przeplywu.

create table jobs (
  id uuid primary key default gen_random_uuid(),
  type job_type not null,
  payload jsonb not null default '{}'::jsonb,
  status job_status not null default 'queued',
  priority int not null default 50,
  attempts int not null default 0,
  max_attempts int not null default 3,
  next_run_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  -- Idempotencja: to samo zadanie nie moze trafic do kolejki dwa razy.
  dedupe_key text,
  error text,
  story_id uuid references stories (id) on delete cascade,
  article_id uuid references articles (id) on delete cascade,
  source_id uuid references sources (id) on delete cascade,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint jobs_priority_range check (priority between 0 and 100),
  constraint jobs_max_attempts_positive check (max_attempts > 0)
);

alter table jobs enable row level security;

comment on table jobs is 'Kolejka pipeline''u. Pobieranie zadan przez claim_jobs z FOR UPDATE SKIP LOCKED.';

create index jobs_claim_idx on jobs (status, priority desc, next_run_at)
where status in ('queued', 'failed');

create unique index jobs_dedupe_idx on jobs (dedupe_key)
where dedupe_key is not null and status in ('queued', 'running', 'failed');

create index jobs_dead_idx on jobs (created_at desc) where status = 'dead';
create index jobs_stale_idx on jobs (locked_at) where status = 'running';

-- Dodanie zadania. Zwraca null, gdy zadanie o tym dedupe_key jest juz w kolejce.
create or replace function enqueue_job(
  p_type job_type,
  p_payload jsonb default '{}'::jsonb,
  p_priority int default 50,
  p_dedupe_key text default null,
  p_story_id uuid default null,
  p_article_id uuid default null,
  p_source_id uuid default null
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into jobs (type, payload, priority, dedupe_key, story_id, article_id, source_id)
  values (p_type, p_payload, p_priority, p_dedupe_key, p_story_id, p_article_id, p_source_id)
  on conflict (dedupe_key) where dedupe_key is not null and status in ('queued', 'running', 'failed')
  do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- Atomowe pobranie partii zadan. FOR UPDATE SKIP LOCKED gwarantuje, ze wiele
-- rownoleglych instancji process-jobs nigdy nie wezmie tego samego joba.
create or replace function claim_jobs(
  p_types job_type[] default null,
  p_limit int default 5,
  p_worker text default null
) returns setof jobs
language sql
as $$
  update jobs j
  set status = 'running',
      locked_at = now(),
      locked_by = p_worker,
      attempts = j.attempts + 1
  where j.id in (
    select id
    from jobs
    where status in ('queued', 'failed')
      and next_run_at <= now()
      and (p_types is null or type = any (p_types))
    order by priority desc, next_run_at
    limit p_limit
    for update skip locked
  )
  returning j.*;
$$;

create or replace function complete_job(p_id uuid) returns void
language sql
as $$
  update jobs
  set status = 'done',
      processed_at = now(),
      error = null,
      locked_at = null,
      locked_by = null
  where id = p_id;
$$;

-- Backoff wykladniczy: 30s, 60s, 120s. Po wyczerpaniu prob job idzie do dead letter.
create or replace function fail_job(p_id uuid, p_error text) returns void
language plpgsql
as $$
declare
  v_attempts int;
  v_max int;
begin
  select attempts, max_attempts into v_attempts, v_max
  from jobs
  where id = p_id;

  if v_attempts is null then
    return;
  end if;

  if v_attempts >= v_max then
    update jobs
    set status = 'dead',
        error = p_error,
        processed_at = now(),
        locked_at = null,
        locked_by = null
    where id = p_id;
  else
    update jobs
    set status = 'failed',
        error = p_error,
        next_run_at = now() + (interval '30 seconds' * power(2, v_attempts)),
        locked_at = null,
        locked_by = null
    where id = p_id;
  end if;
end;
$$;

-- Joby osierocone przez ubity worker wracaja do kolejki.
create or replace function requeue_stale_jobs(p_older_than interval default interval '15 minutes')
returns int
language plpgsql
as $$
declare
  v_count int;
begin
  with updated as (
    update jobs
    set status = 'queued',
        locked_at = null,
        locked_by = null,
        next_run_at = now()
    where status = 'running'
      and locked_at < now() - p_older_than
    returning 1
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

-- Ponowne uruchomienie martwych zadan po naprawie przyczyny.
-- Nie zwiekszamy max_attempts, tylko zerujemy licznik po swiadomej decyzji.
create or replace function requeue_dead_jobs(p_type job_type default null) returns int
language plpgsql
as $$
declare
  v_count int;
begin
  with updated as (
    update jobs
    set status = 'queued',
        attempts = 0,
        error = null,
        next_run_at = now()
    where status = 'dead'
      and (p_type is null or type = p_type)
    returning 1
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

-- Rozliczenie kosztow LLM per etap i per historia.
create table llm_calls (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs (id) on delete set null,
  story_id uuid references stories (id) on delete set null,
  stage text not null,
  model text not null,
  prompt_version text,
  tokens_in int,
  tokens_out int,
  cost_usd numeric(10, 6),
  latency_ms int,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now(),
  constraint llm_calls_stage_known check (
    stage in ('extract', 'validate', 'write', 'title', 'seo', 'qa')
  )
);

alter table llm_calls enable row level security;

create index llm_calls_stage_idx on llm_calls (stage, created_at desc);
create index llm_calls_story_idx on llm_calls (story_id);
create index llm_calls_failed_idx on llm_calls (created_at desc) where not ok;
