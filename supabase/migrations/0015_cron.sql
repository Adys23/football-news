-- 0015_cron.sql
-- Harmonogramy pipeline'u. Zakladane warunkowo, bo pg_cron moze byc niedostepny
-- w uboższym srodowisku lokalnym (patrz 0001).
--
-- Wywolania Edge Functions przez pg_net wymagaja sekretu z Vault. W srodowisku
-- lokalnym harmonogramy sa zalozone, ale nieaktywne (active = false), zeby nie
-- generowac ruchu i kosztow podczas pracy nad kodem. Aktywuje je CI dla stagingu
-- i produkcji po ustawieniu sekretow.

-- Uwaga implementacyjna: tabela cron.job nalezy do supabase_admin, a migracje
-- wykonuje rola postgres. Dlatego nie wolno tu uzywac `update cron.job` -
-- konczy sie bledem "permission denied for table job". Do wlaczania i wylaczania
-- harmonogramow sluzy cron.alter_job, ktore dziala na uprawnieniach rozszerzenia.

do $$
declare
  v_has_cron boolean;
  v_job_ids bigint[] := '{}';
  v_job_id bigint;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;

  if not v_has_cron then
    raise warning 'pg_cron niedostepny - pomijam zakladanie harmonogramow.';
    return;
  end if;

  -- Pobieranie zrodel co 5 minut.
  v_job_ids := v_job_ids || cron.schedule(
    'fetch-sources',
    '*/5 * * * *',
    $job$
      select net.http_post(
        url := current_setting('app.functions_url', true) || '/fetch-sources',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
    $job$
  );

  -- Worker kolejki co minute.
  v_job_ids := v_job_ids || cron.schedule(
    'process-jobs',
    '* * * * *',
    $job$
      select net.http_post(
        url := current_setting('app.functions_url', true) || '/process-jobs',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$
  );

  -- Joby osierocone przez ubity worker wracaja do kolejki co godzine.
  v_job_ids := v_job_ids || cron.schedule(
    'requeue-stale-jobs',
    '17 * * * *',
    $job$ select public.requeue_stale_jobs(); $job$
  );

  -- Retencja raw_data w source_items: 30 dni.
  v_job_ids := v_job_ids || cron.schedule(
    'purge-raw-data',
    '30 3 * * *',
    $job$
      update public.source_items
      set raw_data = null
      where raw_data is not null
        and created_at < now() - interval '30 days';
    $job$
  );

  -- Porzadki w kolejce: zakonczone joby starsze niz 14 dni.
  v_job_ids := v_job_ids || cron.schedule(
    'purge-done-jobs',
    '45 3 * * *',
    $job$
      delete from public.jobs
      where status = 'done'
        and processed_at < now() - interval '14 days';
    $job$
  );

  -- Domyslnie harmonogramy sa zalozone, ale nieaktywne. Wlacza je swiadoma
  -- decyzja dla stagingu i produkcji, po ustawieniu sekretow w Vault.
  foreach v_job_id in array v_job_ids loop
    perform cron.alter_job(v_job_id, active := false);
  end loop;
exception
  when others then
    raise warning 'Nie udalo sie zalozyc harmonogramow (%). Pomijam.', sqlerrm;
end;
$$;
