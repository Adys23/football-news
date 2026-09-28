-- 0007_editor_audit.test.sql
-- Migracja 0019: akcje redakcji z sesji uzytkownika zostawiaja slad w audit_log,
-- a ponowienie martwego joba jest zarezerwowane dla admina.
-- Sesje symulujemy rola authenticated i claimem sub w request.jwt.claims.

begin;

create extension if not exists pgtap;

select plan(14);

insert into stories (id, title, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71', 'Historia do publikacji', 'review'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa72', 'Historia do odrzucenia', 'review');

insert into articles (id, story_id, title, slug, status)
values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb71',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71',
    'Artykul do publikacji przez redaktora',
    'artykul-do-publikacji-przez-redaktora',
    'review'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb72',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa72',
    'Artykul do odrzucenia przez redaktora',
    'artykul-do-odrzucenia-przez-redaktora',
    'review'
  );

insert into jobs (id, type, status, attempts, error)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddd71', 'EXTRACT_FACTS', 'dead', 3, 'blad testowy');

-- === Sesja redaktora (editor) ===

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111112", "role": "authenticated"}', true);

-- 1. Publikacja z sesji redaktora nie pada na RLS audit_log.
select lives_ok(
  $$ update articles
     set status = 'published',
         approved_by = '11111111-1111-4111-8111-111111111112'
     where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb71' $$,
  'editor publikuje artykul z approved_by'
);

-- 2. Odrzucenie bez approved_by bierze aktora z auth.uid().
select lives_ok(
  $$ update articles set status = 'rejected'
     where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb72' $$,
  'editor odrzuca artykul'
);

-- 3. Rewizja redaktora.
select lives_ok(
  $$ insert into article_revisions (article_id, title, edited_by)
     values (
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb71',
       'Poprawiony tytul',
       '11111111-1111-4111-8111-111111111112'
     ) $$,
  'editor zapisuje rewizje'
);

-- 4. Editor nie ponawia martwych jobow.
select throws_ok(
  $$ select requeue_dead_job('dddddddd-dddd-4ddd-8ddd-dddddddddd71') $$,
  '42501',
  null,
  'editor nie moze wywolac requeue_dead_job'
);

reset role;

-- Rewizja modelu (edited_by is null) z pipeline'u.
insert into article_revisions (article_id, title)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb72', 'Wersja modelu');

select is(
  (
    select count(*)
    from audit_log
    where action = 'publish'
      and entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb71'
      and actor_id = '11111111-1111-4111-8111-111111111112'
  ),
  1::bigint,
  'publikacja redaktora jest w audit_log z jego actor_id'
);

select is(
  (
    select count(*)
    from audit_log
    where action = 'reject'
      and entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb72'
      and actor_id = '11111111-1111-4111-8111-111111111112'
  ),
  1::bigint,
  'odrzucenie ma aktora z auth.uid()'
);

select is(
  (
    select count(*)
    from audit_log a
    join article_revisions r on r.id = (a.diff ->> 'revision_id')::uuid
    where a.action = 'edit'
      and a.entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb71'
      and a.actor_id = '11111111-1111-4111-8111-111111111112'
  ),
  1::bigint,
  'rewizja redaktora tworzy wpis edit z revision_id'
);

select is(
  (
    select count(*)
    from audit_log
    where action = 'edit'
      and entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb72'
  ),
  0::bigint,
  'rewizja modelu nie trafia do audit_log'
);

-- === Sesja czytelnika (viewer) ===

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111113", "role": "authenticated"}', true);

update articles
set title = 'Zmiana przez czytelnika'
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb72';

reset role;

select is(
  (select title from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb72'),
  'Artykul do odrzucenia przez redaktora',
  'viewer nie zmienia artykulu'
);

-- === Sesja admina ===

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);

select is(
  requeue_dead_job('dddddddd-dddd-4ddd-8ddd-dddddddddd71'),
  true,
  'admin ponawia martwy job'
);

update sources
set active = false
where name = 'BBC Sport Football';

update sources
set last_checked_at = now()
where name = 'The Guardian Football';

reset role;

select is(
  (select status::text || ':' || attempts::text from jobs where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd71'),
  'queued:0',
  'ponowiony job wraca do queued z wyzerowanymi probami'
);

select is(
  (
    select count(*)
    from audit_log a
    join sources s on s.id = a.entity_id
    where a.action = 'source_change'
      and s.name = 'BBC Sport Football'
      and a.actor_id = '11111111-1111-4111-8111-111111111111'
      and a.diff -> 'active' = '{"from": true, "to": false}'::jsonb
  ),
  1::bigint,
  'wylaczenie zrodla przez admina tworzy source_change'
);

select is(
  (
    select count(*)
    from audit_log a
    join sources s on s.id = a.entity_id
    where a.action = 'source_change'
      and s.name = 'The Guardian Football'
  ),
  0::bigint,
  'zmiana pol technicznych zrodla nie trafia do audit_log'
);

select ok(
  not has_function_privilege('authenticated', 'requeue_dead_jobs(job_type)', 'execute'),
  'authenticated nie ma execute na requeue_dead_jobs'
);

select * from finish();

rollback;
