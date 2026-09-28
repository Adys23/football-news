-- 0008_save_article_edit.test.sql
-- Migracja 0020: edycja redaktora zapisuje snapshot i artykul w jednej transakcji,
-- tylko w statusie review i tylko na wersji, ktora redaktor widzial.
-- Sesje symulujemy rola authenticated i claimem sub w request.jwt.claims.

begin;

create extension if not exists pgtap;

select plan(17);

insert into stories (id, title, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa81', 'Historia w recenzji', 'review'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa82', 'Historia w pipelinie', 'drafting'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa83', 'Historia opublikowana', 'published');

insert into articles (id, story_id, title, slug, lead, content, status, approved_by, updated_at)
values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb81',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa81',
    'Tytul od modelu do poprawy',
    'tytul-od-modelu-do-poprawy',
    'Lead od modelu.',
    '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit modelu."}]}',
    'review',
    null,
    '2026-01-01 10:00:00+00'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb82',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa82',
    'Draft w trakcie pipeline',
    'draft-w-trakcie-pipeline',
    null,
    '{"version": 1, "blocks": []}',
    'draft',
    null,
    '2026-01-01 10:00:00+00'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb83',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa83',
    'Artykul juz opublikowany',
    'artykul-juz-opublikowany',
    null,
    '{"version": 1, "blocks": []}',
    'published',
    '11111111-1111-4111-8111-111111111112',
    '2026-01-01 10:00:00+00'
  );

-- === Sesja redaktora (editor) ===

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111112", "role": "authenticated"}', true);

-- 1. Zapis bez zmian nie tworzy rewizji.
select is(
  save_article_edit(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb81',
    '2026-01-01 10:00:00+00',
    'Tytul od modelu do poprawy',
    'Lead od modelu.',
    '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit modelu."}]}'
  ),
  '2026-01-01 10:00:00+00'::timestamptz,
  'zapis bez zmian zwraca dotychczasowy updated_at'
);

-- 2. Edycja w review.
select lives_ok(
  $$ select save_article_edit(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb81',
       '2026-01-01 10:00:00+00',
       'Tytul poprawiony przez redaktora',
       'Lead redaktora.',
       '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit redaktora."}]}'
     ) $$,
  'editor zapisuje edycje artykulu w review'
);

-- 3. Druga karta z wersja sprzed edycji nie nadpisuje zmian.
select throws_ok(
  $$ select save_article_edit(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb81',
       '2026-01-01 10:00:00+00',
       'Tytul z nieaktualnej karty',
       null,
       '{"version": 1, "blocks": []}'
     ) $$,
  '40001',
  null,
  'nieaktualny updated_at konczy sie konfliktem'
);

-- 4. Blad po zapisie snapshotu wycofuje takze snapshot.
select throws_ok(
  format(
    $$ select save_article_edit(
         'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb81',
         %L,
         repeat('x', 91),
         null,
         '{"version": 1, "blocks": []}'
       ) $$,
    (select updated_at from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb81')
  ),
  '23514',
  null,
  'tytul ponad limit bazy odrzuca cala edycje'
);

-- 5. Draft nalezy do pipeline'u.
select throws_ok(
  $$ select save_article_edit(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb82',
       '2026-01-01 10:00:00+00',
       'Edycja draftu',
       null,
       '{"version": 1, "blocks": []}'
     ) $$,
  '55000',
  null,
  'draft nie jest edytowalny z panelu'
);

-- 6. Opublikowany tekst zmienia sie przez article_updates.
select throws_ok(
  $$ select save_article_edit(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb83',
       '2026-01-01 10:00:00+00',
       'Edycja opublikowanego',
       null,
       '{"version": 1, "blocks": []}'
     ) $$,
  '55000',
  null,
  'opublikowany artykul nie jest edytowalny'
);

-- 7. Nieistniejacy artykul.
select throws_ok(
  $$ select save_article_edit(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb89',
       '2026-01-01 10:00:00+00',
       'Edycja nieistniejacego',
       null,
       '{"version": 1, "blocks": []}'
     ) $$,
  'P0002',
  null,
  'brak artykulu to no_data_found'
);

reset role;

select is(
  (
    select title || ' | ' || lead || ' | ' || (content #>> '{blocks,0,text}')
    from articles
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb81'
  ),
  'Tytul poprawiony przez redaktora | Lead redaktora. | Akapit redaktora.',
  'artykul ma wersje redaktora'
);

select ok(
  (select updated_at > '2026-01-01 10:00:00+00' from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb81'),
  'edycja przesuwa updated_at'
);

select is(
  (select count(*) from article_revisions where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb81'),
  1::bigint,
  'jedna rewizja: zapis bez zmian i odrzucone edycje jej nie tworza'
);

select is(
  (
    select title || ' | ' || lead || ' | ' || (content #>> '{blocks,0,text}') || ' | ' || edited_by::text
    from article_revisions
    where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb81'
  ),
  'Tytul od modelu do poprawy | Lead od modelu. | Akapit modelu. | 11111111-1111-4111-8111-111111111112',
  'rewizja to wersja sprzed edycji z autorem edycji'
);

select is(
  (
    select count(*)
    from audit_log a
    join article_revisions r on r.id = (a.diff ->> 'revision_id')::uuid
    where a.action = 'edit'
      and a.entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb81'
      and a.actor_id = '11111111-1111-4111-8111-111111111112'
  ),
  1::bigint,
  'edycja ma jeden wpis edit w audit_log'
);

select is(
  (
    select count(*)
    from article_revisions
    where article_id in ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb82', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb83')
  ),
  0::bigint,
  'odrzucone edycje draftu i opublikowanego nie zostawiaja rewizji'
);

-- === Sesja czytelnika (viewer) ===

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111113", "role": "authenticated"}', true);

select throws_ok(
  $$ select save_article_edit(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb81',
       now(),
       'Edycja czytelnika',
       null,
       '{"version": 1, "blocks": []}'
     ) $$,
  '42501',
  null,
  'viewer nie edytuje artykulu'
);

reset role;

select is(
  (select title from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb81'),
  'Tytul poprawiony przez redaktora',
  'artykul bez zmian po probie czytelnika'
);

select ok(
  not has_function_privilege('anon', 'save_article_edit(uuid, timestamptz, text, text, jsonb)', 'execute'),
  'anon nie ma execute na save_article_edit'
);

select ok(
  has_function_privilege('authenticated', 'save_article_edit(uuid, timestamptz, text, text, jsonb)', 'execute'),
  'authenticated ma execute na save_article_edit'
);

select * from finish();

rollback;
