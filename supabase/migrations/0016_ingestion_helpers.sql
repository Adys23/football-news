-- 0016_ingestion_helpers.sql
-- Funkcje dla etapu 1: dispatcher zrodel i trigramowa deduplikacja historii.
-- Nie zmieniamy wczesniejszych migracji.

-- Zrodla, ktorym minal interwal pobierania. Dispatcher fetch-sources kolejkuje
-- dla nich FETCH_SOURCE.
create or replace function list_due_sources()
returns setof sources
language sql
stable
as $$
  select *
    from sources
   where active
     and (
       last_checked_at is null
       or last_checked_at + make_interval(mins => fetch_interval_minutes) <= now()
     );
$$;

comment on function list_due_sources() is
  'Aktywne zrodla gotowe do pobrania. Uzywane przez Edge Function fetch-sources.';

-- Kandydaci do dopasowania materialu do istniejacej historii.
-- Warstwa 2 z docs/architecture.md: pg_trgm, prog i okno z settings.
create or replace function find_similar_stories(
  p_title_normalized text,
  p_since timestamptz,
  p_threshold numeric
)
returns table (story_id uuid, similarity numeric)
language sql
stable
as $$
  select s.id as story_id,
         similarity(normalize_title(s.title), p_title_normalized) as similarity
    from stories s
   where s.last_updated_at >= p_since
     and similarity(normalize_title(s.title), p_title_normalized) > p_threshold
   order by similarity desc
   limit 10;
$$;

comment on function find_similar_stories(text, timestamptz, numeric) is
  'Historie z okna czasowego o tytule podobnym powyzej progu pg_trgm.';
