-- 0017_cron_vault.test.sql
-- Migracja 0029: harmonogramy fetch-sources i process-jobs wolaja Edge Functions
-- z adresem i kluczem z Vault, a nie z GUC app.*. Bez sekretow nic nie wychodzi.
-- Harmonogramy zostaja nieaktywne jak po 0015.
-- Kolejka pg_net jest transakcyjna, a test konczy sie rollbackiem, wiec nic nie wychodzi w siec.

begin;

create extension if not exists pgtap;

select plan(17);

select has_function(
  'public', 'invoke_edge_function', array['text', 'integer'],
  'funkcja wolajaca Edge Functions istnieje'
);
select has_extension('pg_cron', 'pg_cron zainstalowany');

select function_privs_are(
  'public', 'invoke_edge_function', array['text', 'integer'], 'authenticated', array[]::text[],
  'zalogowany uzytkownik nie wywola Edge Function kluczem service_role'
);
select function_privs_are(
  'public', 'invoke_edge_function', array['text', 'integer'], 'anon', array[]::text[],
  'anon nie wywola Edge Function kluczem service_role'
);

-- === Harmonogramy ===

select results_eq(
  $$
    select jobname::text, btrim(command)
    from cron.job
    where jobname in ('fetch-sources', 'process-jobs')
    order by jobname
  $$,
  $$
    values
      ('fetch-sources'::text, 'select public.invoke_edge_function(''fetch-sources'', 30000);'::text),
      ('process-jobs'::text, 'select public.invoke_edge_function(''process-jobs'', 60000);'::text)
  $$,
  'fetch-sources i process-jobs wolaja invoke_edge_function'
);

select is(
  (select count(*) from cron.job where command like '%current_setting(''app.%'),
  0::bigint,
  'zaden harmonogram nie czyta GUC app.*'
);

select results_eq(
  $$ select jobname::text, active from cron.job order by jobname $$,
  $$
    values
      ('fetch-sources'::text, false),
      ('process-jobs'::text, false),
      ('purge-done-jobs'::text, false),
      ('purge-raw-data'::text, false),
      ('requeue-stale-jobs'::text, false)
  $$,
  'harmonogramy dalej sa zalozone i nieaktywne'
);

select results_eq(
  $$ select jobname::text, schedule::text from cron.job where jobname in ('fetch-sources', 'process-jobs') order by jobname $$,
  $$ values ('fetch-sources'::text, '*/5 * * * *'::text), ('process-jobs'::text, '* * * * *'::text) $$,
  'harmonogramy bez zmian'
);

create temporary table request_baseline as
select coalesce(max(id), 0) as last_id from net.http_request_queue;

create or replace function pg_temp.requests()
returns table (method text, url text, auth text, content_type text, body jsonb, timeout_ms integer)
language sql as $$
  select q.method, q.url, q.headers ->> 'Authorization', q.headers ->> 'Content-Type',
    convert_from(q.body, 'UTF8')::jsonb, q.timeout_milliseconds
  from net.http_request_queue q
  where q.id > (select last_id from request_baseline)
  order by q.id
$$;

create or replace function pg_temp.reset_requests() returns void
language sql as $$
  update request_baseline set last_id = coalesce((select max(id) from net.http_request_queue), 0)
$$;

create or replace function pg_temp.run_job(p_name text) returns void
language plpgsql as $$
begin
  execute (select command from cron.job where jobname = p_name);
end;
$$;

-- === Bez sekretow w Vault ===

select lives_ok($$ select pg_temp.run_job('fetch-sources') $$, 'fetch-sources bez sekretow nie konczy sie bledem');
select lives_ok($$ select pg_temp.run_job('process-jobs') $$, 'process-jobs bez sekretow nie konczy sie bledem');
select is((select count(*) from pg_temp.requests()), 0::bigint, 'bez sekretow nic nie trafia do pg_net');

-- === Z sekretami w Vault ===

select vault.create_secret('http://kong:8000/functions/v1/', 'cron_functions_url');
select vault.create_secret('klucz-testowy', 'cron_service_role_key');

select pg_temp.run_job('fetch-sources');
select pg_temp.run_job('process-jobs');

select results_eq(
  $$ select method, url, auth, content_type, body, timeout_ms from pg_temp.requests() $$,
  $$
    values
      ('POST'::text, 'http://kong:8000/functions/v1/fetch-sources'::text, 'Bearer klucz-testowy'::text,
        'application/json'::text, '{}'::jsonb, 30000),
      ('POST'::text, 'http://kong:8000/functions/v1/process-jobs'::text, 'Bearer klucz-testowy'::text,
        'application/json'::text, '{}'::jsonb, 60000)
  $$,
  'harmonogramy kolejkuja POST na URL z Vault z kluczem w Authorization'
);

select isnt(
  public.invoke_edge_function('fetch-sources'),
  null::bigint,
  'invoke_edge_function zwraca id zadania pg_net'
);

select throws_ok(
  $$ select public.invoke_edge_function('../rest/v1/profiles') $$,
  '22023',
  null,
  'nazwa funkcji spoza konwencji nie trafia do URL'
);

-- Pusty klucz wylacza wywolania.
select vault.update_secret((select id from vault.secrets where name = 'cron_service_role_key'), '  ');
select pg_temp.reset_requests();
select is(public.invoke_edge_function('process-jobs'), null::bigint, 'pusty klucz: brak wywolania');

-- Pusty URL tez.
select vault.update_secret((select id from vault.secrets where name = 'cron_service_role_key'), 'klucz-testowy');
select vault.update_secret((select id from vault.secrets where name = 'cron_functions_url'), '');
select is(public.invoke_edge_function('process-jobs'), null::bigint, 'pusty URL: brak wywolania');

select is((select count(*) from pg_temp.requests()), 0::bigint, 'bez kompletu sekretow nic nie trafia do pg_net');

select * from finish();

rollback;
