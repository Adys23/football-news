-- 0001_extensions.sql
-- Rozszerzenia wymagane przez newsroom.
-- pgcrypto, pg_net i uuid-ossp sa juz zainstalowane przez Supabase w schemacie extensions.

-- Podobienstwo tytulow w deduplikacji (etap 1 roadmapy).
create extension if not exists pg_trgm with schema extensions;

-- Normalizacja znakow diakrytycznych w zapytaniach pomocniczych.
create extension if not exists unaccent with schema extensions;

-- Embeddingi historii (etap 5 roadmapy). Kolumna istnieje od poczatku,
-- zeby nie zmieniac schematu pod ruchem produkcyjnym.
create extension if not exists vector with schema extensions;

-- pg_cron jest w shared_preload_libraries obrazu Supabase, ale w uboższych
-- instalacjach moze byc niedostepny. Nie blokujemy wtedy calej migracji -
-- harmonogramy w 0015 zakladamy warunkowo.
do $$
begin
  execute 'create extension if not exists pg_cron';
exception
  when others then
    raise warning 'pg_cron niedostepny (%). Harmonogramy nie zostana zalozone.', sqlerrm;
end;
$$;
