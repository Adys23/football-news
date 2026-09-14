-- 0004_dedupe.test.sql
-- Funkcje etapu 1: dispatcher zrodel i trigramowe dopasowanie historii.

begin;

create extension if not exists pgtap;

select plan(2);

-- Dwargumentowe has_function(schema, name) jest mylone z has_function(name, args).
select has_function('list_due_sources');
select has_function('find_similar_stories', ARRAY['text', 'timestamptz', 'numeric']);

select * from finish();
rollback;
