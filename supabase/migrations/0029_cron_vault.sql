-- 0029_cron_vault.sql
-- Harmonogramy fetch-sources i process-jobs z 0015 czytaly adres Edge Functions
-- i klucz z GUC app.functions_url / app.service_role_key. Takiej konfiguracji
-- nikt nie ustawial (komentarz w 0015 mowi o Vault), a klucz service_role w
-- ALTER DATABASE SET lezy jawnym tekstem w pg_db_role_setting. Od tej migracji
-- oba harmonogramy wolaja invoke_edge_function(), ktora czyta sekrety z Vault
-- w chwili wywolania, jak send_revalidate_webhook() z 0022:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'cron_functions_url');
--   select vault.create_secret('<klucz service_role>', 'cron_service_role_key');
--
-- Brak pg_net, Vault albo sekretow to brak wywolania (raise log), nie blad crona.
-- Aktywnosc harmonogramow sie nie zmienia: cron.alter_job zmienia tylko polecenie,
-- wiec lokalnie i w CI zostaja nieaktywne jak po 0015.

create or replace function invoke_edge_function(p_function text, p_timeout_ms integer default 30000)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  -- Nazwa trafia do sciezki URL, wiec tylko segment w konwencji nazw funkcji.
  if p_function is null or p_function !~ '^[a-z0-9][a-z0-9_-]*$' then
    raise exception 'Niepoprawna nazwa Edge Function: %', p_function using errcode = '22023';
  end if;

  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    raise log 'invoke_edge_function(%): pg_net niedostepny, pomijam', p_function;
    return null;
  end if;

  if to_regclass('vault.decrypted_secrets') is null then
    raise log 'invoke_edge_function(%): Vault niedostepny, pomijam', p_function;
    return null;
  end if;

  select
    max(s.decrypted_secret) filter (where s.name = 'cron_functions_url'),
    max(s.decrypted_secret) filter (where s.name = 'cron_service_role_key')
  into v_url, v_key
  from vault.decrypted_secrets s
  where s.name in ('cron_functions_url', 'cron_service_role_key');

  v_url := rtrim(btrim(coalesce(v_url, '')), '/');
  v_key := btrim(coalesce(v_key, ''));

  if v_url = '' or v_key = '' then
    raise log 'invoke_edge_function(%): brak sekretow crona w Vault, pomijam', p_function;
    return null;
  end if;

  return net.http_post(
    url := v_url || '/' || p_function,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := p_timeout_ms
  );
end;
$$;

-- Wywoluje ja wylacznie pg_cron jako wlasciciel harmonogramow (postgres).
revoke all on function invoke_edge_function(text, integer) from public, anon, authenticated, service_role;

do $$
declare
  v_job record;
  v_job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning 'pg_cron niedostepny - pomijam przepiecie harmonogramow na Vault.';
    return;
  end if;

  for v_job in
    select *
    from (values
      ('fetch-sources', '*/5 * * * *', $job$ select public.invoke_edge_function('fetch-sources', 30000); $job$),
      ('process-jobs', '* * * * *', $job$ select public.invoke_edge_function('process-jobs', 60000); $job$)
    ) as j (name, schedule, command)
  loop
    select c.jobid into v_job_id from cron.job c where c.jobname = v_job.name;

    if v_job_id is null then
      -- 0015 nie zalozyla harmonogramu (np. pominela go po bledzie). Zakladamy
      -- go tak jak ona: nieaktywny, do wlaczenia swiadoma decyzja.
      v_job_id := cron.schedule(v_job.name, v_job.schedule, v_job.command);
      perform cron.alter_job(v_job_id, active := false);
    else
      perform cron.alter_job(v_job_id, command := v_job.command);
    end if;
  end loop;
exception
  when others then
    raise warning 'Nie udalo sie przepiac harmonogramow na Vault (%). Pomijam.', sqlerrm;
end;
$$;
