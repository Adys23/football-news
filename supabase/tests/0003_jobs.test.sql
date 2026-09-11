-- Kolejka zadan jest sercem pipeline'u: idempotencja, atomowe pobieranie
-- i backoff musza dzialac dokladnie tak, jak zaklada docs/ai-pipeline.md.

begin;

create extension if not exists pgtap;

select plan(9);

insert into stories (id, title, status)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Historia do przetworzenia', 'new');

-- 1. Zakolejkowanie zadania zwraca identyfikator.
select isnt(
  enqueue_job(
    'EXTRACT_FACTS',
    '{"storyId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}'::jsonb,
    60,
    'EXTRACT_FACTS:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  null,
  'enqueue_job zwraca id nowego zadania'
);

-- 2. To samo zadanie nie moze trafic do kolejki dwa razy.
select is(
  enqueue_job(
    'EXTRACT_FACTS',
    '{"storyId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}'::jsonb,
    60,
    'EXTRACT_FACTS:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  null,
  'enqueue_job z tym samym dedupe_key nie tworzy duplikatu'
);

select is((select count(*) from jobs), 1::bigint, 'w kolejce jest dokladnie jedno zadanie');

-- 3. Pobranie zadania ustawia status running i zwieksza licznik prob.
select is(
  (select count(*) from claim_jobs(array['EXTRACT_FACTS']::job_type[], 5, 'test-worker')),
  1::bigint,
  'claim_jobs zwraca zakolejkowane zadanie'
);

select is(
  (select status::text || ':' || attempts::text from jobs limit 1),
  'running:1',
  'claim_jobs ustawia running i attempts = 1'
);

-- 4. Zadanie w trakcie nie moze zostac pobrane po raz drugi.
select is(
  (select count(*) from claim_jobs(array['EXTRACT_FACTS']::job_type[], 5, 'inny-worker')),
  0::bigint,
  'zadanie w trakcie nie jest pobierane rownolegle'
);

-- 5. Pierwsza porazka odklada ponowna probe o okolo 60 sekund (30s * 2^1).
select fail_job((select id from jobs limit 1), 'blad testowy');

select ok(
  (
    select status = 'failed'
      and next_run_at between now() + interval '50 seconds' and now() + interval '70 seconds'
    from jobs
    limit 1
  ),
  'fail_job ustawia status failed i backoff okolo 60 sekund'
);

-- 6. Po wyczerpaniu prob zadanie trafia do dead letter.
update jobs set attempts = max_attempts;
select fail_job((select id from jobs limit 1), 'blad koncowy');

select is(
  (select status::text from jobs limit 1),
  'dead',
  'po wyczerpaniu prob zadanie trafia do dead letter'
);

-- 7. Swiadoma decyzja pozwala wrocic martwe zadania do kolejki.
select is(
  requeue_dead_jobs('EXTRACT_FACTS'),
  1,
  'requeue_dead_jobs przywraca martwe zadania wskazanego typu'
);

select * from finish();

rollback;
