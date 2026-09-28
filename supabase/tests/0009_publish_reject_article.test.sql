-- 0009_publish_reject_article.test.sql
-- Migracja 0021: publikacja i odrzucenie z panelu ustawiaja status artykulu i historii,
-- approved_by redaktora, a audit_log ma dokladnie jeden wpis na decyzje.
-- Sesje symulujemy rola authenticated i claimem sub w request.jwt.claims.

begin;

create extension if not exists pgtap;

select plan(29);

insert into stories (id, title, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91', 'Historia do publikacji', 'review'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa92', 'Historia do odrzucenia', 'review'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa93', 'Historia bez leadu', 'review'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa94', 'Historia z twierdzeniami bez podparcia', 'review'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa95', 'Historia odrzucana bez powodu', 'review'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa96', 'Historia publikowana przez admina', 'review'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa97', 'Historia edytowana po ocenie', 'review'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa98', 'Historia bez metadanych SEO', 'review');

insert into articles (
  id, story_id, title, slug, lead, content, status, category_id, seo_title, seo_description, updated_at
)
select
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb9' || n)::uuid,
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa9' || n)::uuid,
  'Artykul testowy ' || n,
  'artykul-testowy-' || n,
  case when n = 3 then '   ' else 'Lead artykulu.' end,
  '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit."}]}',
  'review',
  '33333333-3333-4333-8333-333333333331',
  case when n = 8 then null else 'Tytul SEO ' || n end,
  'Opis SEO artykulu testowego o przedluzeniu kontraktu zawodnika z klubem, ze szczegolami umowy i komentarzem trenera druzyny.',
  '2026-01-01 10:00:00+00'
from generate_series(1, 8) as n;

insert into article_scores (article_id, unsupported_claims, checked_at)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91', 0, '2026-01-01 09:00:00+00'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb94', 2, '2026-01-01 09:00:00+00'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb97', 0, '2026-01-01 09:00:00+00');

-- Po ocenie z 09:00: artykul 1 ma tylko rewizje modelu (edited_by null, nie liczy sie),
-- artykul 7 edycje redaktora, wiec jego ocena jest nieaktualna.
insert into article_revisions (article_id, title, lead, content, edited_by, created_at)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91', 'Artykul testowy 1', 'Lead artykulu.',
   '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit."}]}', null, '2026-01-01 09:30:00+00'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb97', 'Artykul testowy 7', 'Lead artykulu.',
   '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit."}]}',
   '11111111-1111-4111-8111-111111111112', '2026-01-01 09:30:00+00');

-- === Sesja redaktora (editor, bez profilu autora) ===

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111112", "role": "authenticated"}', true);

-- 1. Nieaktualna wersja nie jest publikowana.
select throws_ok(
  $$ select publish_article('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91', '2026-01-01 09:00:00+00') $$,
  '40001',
  null,
  'publikacja wersji innej niz widziana konczy sie konfliktem'
);

-- 2. Publikacja.
select lives_ok(
  $$ select publish_article('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91', '2026-01-01 10:00:00+00') $$,
  'editor publikuje artykul z review'
);

-- 3. Drugi raz nie mozna.
select throws_ok(
  $$ select publish_article(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91',
       (select updated_at from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91')
     ) $$,
  '55000',
  null,
  'opublikowany artykul nie jest publikowany ponownie'
);

-- 4. Brak leadu.
select throws_ok(
  $$ select publish_article('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb93', '2026-01-01 10:00:00+00') $$,
  '23502',
  null,
  'artykul z pustym leadem nie jest publikowany'
);

-- 5. Guard z 0011 nadal blokuje twierdzenia bez podparcia.
select throws_ok(
  $$ select publish_article('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb94', '2026-01-01 10:00:00+00') $$,
  '23514',
  null,
  'unsupported_claims > 0 blokuje publikacje'
);

-- 6. Nieistniejacy artykul.
select throws_ok(
  $$ select publish_article('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb99', '2026-01-01 10:00:00+00') $$,
  'P0002',
  null,
  'brak artykulu to no_data_found'
);

-- 7. Za dlugi powod odrzucenia.
select throws_ok(
  format(
    $$ select reject_article('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb92', '2026-01-01 10:00:00+00', %L) $$,
    repeat('x', 501)
  ),
  '22001',
  null,
  'powod dluzszy niz 500 znakow jest odrzucany'
);

-- 8. Odrzucenie z powodem.
select lives_ok(
  $$ select reject_article(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb92',
       '2026-01-01 10:00:00+00',
       '  Tekst powiela wczorajszy artykul.  '
     ) $$,
  'editor odrzuca artykul z powodem'
);

select is(
  current_setting('app.status_change_reason', true),
  '',
  'powod nie zostaje w transakcji po odrzuceniu'
);

-- 10. Odrzucenie bez powodu.
select lives_ok(
  $$ select reject_article('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb95', '2026-01-01 10:00:00+00', '   ') $$,
  'editor odrzuca artykul bez powodu'
);

select throws_ok(
  $$ select reject_article('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91', now(), null) $$,
  '55000',
  null,
  'opublikowanego artykulu nie mozna odrzucic'
);

reset role;

select is(
  (
    select status::text || ' | ' || approved_by::text || ' | ' || (published_at is not null)::text
      || ' | ' || coalesce(author_id::text, 'brak autora')
    from articles
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91'
  ),
  'published | 11111111-1111-4111-8111-111111111112 | true | brak autora',
  'publikacja ustawia status, approved_by redaktora i published_at'
);

select is(
  (select status::text from stories where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91'),
  'published',
  'historia opublikowanego artykulu jest published'
);

select is(
  (
    select jsonb_agg(jsonb_build_object('action', action, 'actor', actor_id, 'diff', diff))
    from audit_log
    where entity_type = 'article' and entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91'
  ),
  jsonb_build_array(jsonb_build_object(
    'action', 'publish',
    'actor', '11111111-1111-4111-8111-111111111112',
    'diff', jsonb_build_object('from', 'review', 'to', 'published')
  )),
  'publikacja ma jeden wpis publish z aktorem redaktorem'
);

select is(
  (
    select status::text
    from articles
    where id in ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb93', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb94')
    group by status
  ),
  'review',
  'zablokowane publikacje zostawiaja artykuly w review'
);

select is(
  (select count(*) from audit_log where entity_id in ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb93', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb94')),
  0::bigint,
  'zablokowane publikacje nie zostawiaja wpisow w audit_log'
);

select is(
  (
    select a.status::text || ' | ' || coalesce(a.approved_by::text, 'null') || ' | ' || s.status::text
    from articles a
    join stories s on s.id = a.story_id
    where a.id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb92'
  ),
  'rejected | null | rejected',
  'odrzucenie ustawia status artykulu i historii, bez approved_by'
);

select is(
  (
    select jsonb_agg(jsonb_build_object('action', action, 'actor', actor_id, 'diff', diff))
    from audit_log
    where entity_type = 'article' and entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb92'
  ),
  jsonb_build_array(jsonb_build_object(
    'action', 'reject',
    'actor', '11111111-1111-4111-8111-111111111112',
    'diff', jsonb_build_object('from', 'review', 'to', 'rejected', 'reason', 'Tekst powiela wczorajszy artykul.')
  )),
  'odrzucenie ma jeden wpis reject z przycietym powodem'
);

select is(
  (select diff from audit_log where entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb95'),
  jsonb_build_object('from', 'review', 'to', 'rejected'),
  'odrzucenie bez powodu nie ma klucza reason'
);

-- === Sesja admina z profilem autora ===

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);

select lives_ok(
  $$ select publish_article('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb96', '2026-01-01 10:00:00+00') $$,
  'admin publikuje artykul'
);

reset role;

select is(
  (select author_id from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb96'),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'artykul bez autora dostaje profil autora publikujacego'
);

-- === Brak metadanych SEO (0025) ===

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111112", "role": "authenticated"}', true);

select throws_ok(
  $$ select publish_article('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb98', '2026-01-01 10:00:00+00') $$,
  '23502',
  null,
  'artykul bez tytulu SEO nie jest publikowany'
);

reset role;

-- === Ocena sprzed edycji redaktora (sesja redaktora) ===

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111112", "role": "authenticated"}', true);

select throws_ok(
  $$ select publish_article('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb97', '2026-01-01 10:00:00+00') $$,
  '22023',
  null,
  'ocena sprzed edycji redaktora blokuje publikacje bez potwierdzenia'
);

select lives_ok(
  $$ select publish_article('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb97', '2026-01-01 10:00:00+00', true) $$,
  'publikacja z potwierdzeniem przy ocenie sprzed edycji'
);

reset role;

select is(
  (select diff ->> 'reason' from audit_log
   where entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb97' and action = 'publish'),
  'Publikacja z ocena automatyczna sprzed edycji redaktora',
  'audit_log zapisuje, ze publikacja byla przy nieaktualnej ocenie'
);

select is(
  current_setting('app.status_change_reason', true),
  '',
  'powod publikacji nie zostaje w ustawieniu transakcyjnym'
);

-- === Sesja czytelnika (viewer) ===

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111113", "role": "authenticated"}', true);

select throws_ok(
  $$ select publish_article('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb93', '2026-01-01 10:00:00+00') $$,
  '42501',
  null,
  'viewer nie publikuje'
);

select throws_ok(
  $$ select reject_article('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb93', '2026-01-01 10:00:00+00', null) $$,
  '42501',
  null,
  'viewer nie odrzuca'
);

reset role;

select ok(
  not has_function_privilege('anon', 'publish_article(uuid, timestamptz, boolean)', 'execute')
    and not has_function_privilege('anon', 'reject_article(uuid, timestamptz, text)', 'execute')
    and not has_function_privilege('anon', 'lock_article_for_decision(uuid, timestamptz)', 'execute'),
  'anon nie ma execute na funkcjach decyzji'
);

select * from finish();

rollback;
