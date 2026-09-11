-- Zasada "czlowiek w petli" jest wymuszona w bazie, nie w kodzie aplikacji.
-- Te testy pilnuja, zeby zadna przyszla zmiana nie otworzyla drogi do publikacji
-- bez akceptacji redaktora albo z twierdzeniami bez podparcia w faktach.

begin;

create extension if not exists pgtap;

select plan(6);

insert into stories (id, title, status)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Testowa historia', 'drafting');

insert into articles (id, story_id, title, slug, lead)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Testowy artykul o transferze zawodnika',
  'testowy-artykul-o-transferze-zawodnika',
  'Lead testowy.'
);

-- 1. Publikacja bez akceptacji redaktora jest niemozliwa.
select throws_ok(
  $$ update articles set status = 'published'
     where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  '23514',
  null,
  'publikacja bez approved_by jest blokowana przez trigger'
);

-- 2. Z akceptacja redaktora publikacja przechodzi.
select lives_ok(
  $$ update articles
     set status = 'published',
         approved_by = '11111111-1111-4111-8111-111111111111'
     where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  'publikacja z approved_by przechodzi'
);

-- 3. Trigger sam ustawia date publikacji.
select isnt(
  (select published_at from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  null,
  'trigger ustawia published_at przy publikacji'
);

-- 4. Zmiana statusu zostawia slad w audit_log.
select is(
  (
    select count(*)
    from audit_log
    where entity_type = 'article'
      and entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      and action = 'publish'
  ),
  1::bigint,
  'publikacja jest zapisana w audit_log'
);

-- 5. Artykul z twierdzeniami bez podparcia w faktach nie moze zostac opublikowany,
--    nawet gdy redaktor go zaakceptowal.
update articles
set status = 'draft'
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

insert into article_scores (article_id, quality, unsupported_claims)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 0.95, 2);

select throws_ok(
  $$ update articles set status = 'published'
     where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  '23514',
  null,
  'publikacja z unsupported_claims > 0 jest blokowana'
);

-- 6. Po wyzerowaniu twierdzen bez zrodla publikacja jest znowu mozliwa.
update article_scores
set unsupported_claims = 0
where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

select lives_ok(
  $$ update articles set status = 'published'
     where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  'publikacja po poprawieniu tekstu przechodzi'
);

select * from finish();

rollback;
