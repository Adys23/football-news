-- 0018_pipeline_hardening.sql
-- Poprawki po etapie 2: odlozenie joba bez zuzywania prob, unikalnosc faktow
-- odporna na usuniecie zrodla, indeks dla sprawdzania dedupe_key w calej historii
-- kolejki oraz progi oceny informacji w settings.

-- Odlozenie joba, ktory nie moze sie teraz wykonac z powodow niezaleznych od danych
-- (np. limit artykulow na godzine). claim_jobs juz podbil attempts, wiec cofamy
-- ten przyrost - odlozenie nie jest porazka i nie przybliza joba do dead.
create or replace function defer_job(p_id uuid, p_delay interval, p_reason text) returns void
language sql
as $$
  update jobs
  set status = 'queued',
      attempts = greatest(attempts - 1, 0),
      next_run_at = now() + p_delay,
      error = p_reason,
      locked_at = null,
      locked_by = null
  where id = p_id
    and status = 'running';
$$;

revoke all on function defer_job(uuid, interval, text) from public, anon, authenticated;
grant execute on function defer_job(uuid, interval, text) to service_role;

-- Fakty identyfikuje material, z ktorego pochodza. Po usunieciu zrodla oba FK
-- przechodza na null i stary indeks sklejal fakty roznych zrodel w jeden klucz.
drop index facts_unique_per_source_idx;

create unique index facts_unique_per_source_idx on facts (
  story_id, subject, predicate, coalesce(object, ''), source_item_id
)
where source_item_id is not null;

-- jobExists pyta o klucz we wszystkich statusach, a jobs_dedupe_idx jest czesciowy.
create index jobs_dedupe_key_idx on jobs (dedupe_key) where dedupe_key is not null;

insert into settings (key, value, description) values
  ('min_approved_fact_confidence', '0.80'::jsonb, 'Bez zatwierdzonego faktu o tej pewnosci historia jest odrzucana.'),
  ('min_source_trust', '0.80'::jsonb, 'Bez zrodla o takim trust_score historia jest odrzucana.')
on conflict (key) do nothing;
