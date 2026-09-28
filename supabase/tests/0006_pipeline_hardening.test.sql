-- 0006_pipeline_hardening.test.sql
-- Migracja 0018: odlozenie joba bez zuzycia proby i usuwanie zrodel z faktami.

begin;

create extension if not exists pgtap;

select plan(7);

insert into stories (id, title, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Historia z dwoch zrodel', 'review');

-- 1. defer_job cofa przyrost attempts z claim_jobs i przesuwa next_run_at.
select enqueue_job(
  'CHECK_ARTICLE',
  '{"articleId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9"}'::jsonb,
  50,
  'CHECK_ARTICLE:defer-test'
);
select claim_jobs(array['CHECK_ARTICLE']::job_type[], 1, 'test-worker');
select defer_job((select id from jobs limit 1), interval '10 minutes', 'limit godzinowy');

select is(
  (select status::text || ':' || attempts::text from jobs limit 1),
  'queued:0',
  'defer_job wraca job do queued bez zuzycia proby'
);

select ok(
  (
    select next_run_at between now() + interval '9 minutes' and now() + interval '11 minutes'
      and locked_by is null
      and error = 'limit godzinowy'
    from jobs
    limit 1
  ),
  'defer_job ustawia next_run_at, zwalnia blokade i zapisuje powod'
);

-- 2. Job, ktory nie jest w trakcie, nie jest odkladany.
update jobs set status = 'done';
select defer_job((select id from jobs limit 1), interval '10 minutes', 'spozniony');

select is((select status::text from jobs limit 1), 'done', 'defer_job pomija joby poza running');

-- 3. Uprawnienia: tylko service_role.
select ok(
  not has_function_privilege('authenticated', 'defer_job(uuid, interval, text)', 'execute')
    and not has_function_privilege('anon', 'defer_job(uuid, interval, text)', 'execute')
    and has_function_privilege('service_role', 'defer_job(uuid, interval, text)', 'execute'),
  'defer_job jest dostepne tylko dla service_role'
);

-- 4. Ten sam fakt z dwoch zrodel przezywa usuniecie obu zrodel.
insert into sources (id, name, url, rss_url, type, trust_score) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Zrodlo A', 'https://a.test', 'https://a.test/rss', 'major_outlet', 0.85),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'Zrodlo B', 'https://b.test', 'https://b.test/rss', 'major_outlet', 0.85);

insert into source_items (id, source_id, url, title, title_normalized, hash) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'https://a.test/1', 'Tytul', 'tytul', 'hash-a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'https://b.test/1', 'Tytul', 'tytul', 'hash-b');

insert into facts (story_id, subject, predicate, object, statement_pl, confidence, source_id, source_item_id) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Bruno', 'extended_contract', 'Manchester United', 'Bruno przedluzyl kontrakt.', 0.9, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Bruno', 'extended_contract', 'Manchester United', 'Bruno przedluzyl kontrakt.', 0.9, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5');

select lives_ok(
  $$delete from sources where id in ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3')$$,
  'usuniecie zrodel z tym samym faktem nie narusza unikalnosci facts'
);

select is(
  (select count(*) from facts where story_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1' and source_item_id is null),
  2::bigint,
  'fakty zostaja przy historii bez przypisanego materialu'
);

-- 5. Progi oceny sa w settings.
select is(
  (select count(*) from settings where key in ('min_approved_fact_confidence', 'min_source_trust')),
  2::bigint,
  'progi oceny informacji sa w settings'
);

select * from finish();

rollback;
