-- 0015_article_images.test.sql
-- Migracja 0027: artykul uzywa wylacznie obrazow z image_assets, ktore nie sa AI; hero musi
-- miec kind = 'hero'. Uzytego obrazu nie da sie oznaczyc jako AI ani usunac z tresci pod
-- artykulem. save_article_edit zmienia hero i zapisuje poprzedni w rewizji.

begin;

create extension if not exists pgtap;

select plan(22);

insert into image_assets (id, kind, url, source, license, width, height, alt, is_ai_generated)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccce001', 'hero', 'https://example.test/a.jpg', 'Test', 'CC BY 4.0', 1600, 900, 'Obraz A', false),
  ('cccccccc-cccc-4ccc-8ccc-cccccccce002', 'hero', 'https://example.test/b.jpg', 'Test', 'CC BY 4.0', 1600, 900, 'Obraz B', false),
  ('cccccccc-cccc-4ccc-8ccc-cccccccce003', 'logo', 'https://example.test/logo.png', 'Test', 'CC BY 4.0', 200, 200, 'Herb', false),
  ('cccccccc-cccc-4ccc-8ccc-cccccccce005', 'hero', 'https://example.test/e.jpg', 'Test', 'CC BY 4.0', 1600, 900, 'Obraz nieuzywany', false);

-- 1. Biblioteka przyjmuje obraz AI jako rekord audytowy (decyzja: blokada tylko przy uzyciu).
select lives_ok(
  $$ insert into image_assets (id, kind, url, source, license, width, height, alt, is_ai_generated)
     values ('cccccccc-cccc-4ccc-8ccc-cccccccce004', 'hero', 'https://example.test/ai.jpg', 'Test',
             'Wewnetrzna', 1600, 900, 'Obraz AI', true) $$,
  'image_assets przyjmuje rekord z is_ai_generated = true'
);

insert into stories (id, title, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaae001', 'Historia z obrazami', 'review'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaae002', 'Historia odrzucanych obrazow', 'review');

-- 2-6. Odwolania spoza zasad.
select throws_ok(
  $$ insert into articles (story_id, title, slug, status, hero_image_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaae002', 'Hero AI', 'hero-ai', 'review',
             'cccccccc-cccc-4ccc-8ccc-cccccccce004') $$,
  '23514',
  null,
  'hero AI odrzucony'
);

select throws_ok(
  $$ insert into articles (story_id, title, slug, status, hero_image_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaae002', 'Hero brak', 'hero-brak', 'review',
             'cccccccc-cccc-4ccc-8ccc-cccccccce0ff') $$,
  '23514',
  null,
  'nieistniejacy hero odrzucony'
);

select throws_ok(
  $$ insert into articles (story_id, title, slug, status, hero_image_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaae002', 'Hero logo', 'hero-logo', 'review',
             'cccccccc-cccc-4ccc-8ccc-cccccccce003') $$,
  '23514',
  null,
  'logo jako hero odrzucone'
);

select throws_ok(
  $$ insert into articles (story_id, title, slug, status, content)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaae002', 'Blok brak', 'blok-brak', 'review',
             '{"version": 1, "blocks": [{"type": "image", "imageId": "cccccccc-cccc-4ccc-8ccc-cccccccce0ff"}]}') $$,
  '23514',
  null,
  'blok image z nieistniejacym obrazem odrzucony'
);

select throws_ok(
  $$ insert into articles (story_id, title, slug, status, content)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaae002', 'Blok AI', 'blok-ai', 'review',
             '{"version": 1, "blocks": [{"type": "image", "imageId": "cccccccc-cccc-4ccc-8ccc-cccccccce004"}]}') $$,
  '23514',
  null,
  'blok image z obrazem AI odrzucony'
);

-- 7. Poprawne obrazy przechodza; logo moze byc w tresci, tylko nie jako hero.
select lives_ok(
  $$ insert into articles (id, story_id, title, slug, lead, status, hero_image_id, content, seo_title, seo_description, updated_at)
     values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbe001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaae001',
             'Artykul z obrazami', 'artykul-z-obrazami', 'Lead.', 'review',
             'cccccccc-cccc-4ccc-8ccc-cccccccce001',
             '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit."}, {"type": "image", "imageId": "cccccccc-cccc-4ccc-8ccc-cccccccce001"}, {"type": "image", "imageId": "cccccccc-cccc-4ccc-8ccc-cccccccce003"}]}',
             'Tytul SEO', repeat('Opis SEO artykulu. ', 7), '2026-01-01 10:00:00+00') $$,
  'artykul z licencjonowanym hero i obrazami w blokach zapisany'
);

-- === Sesja redaktora ===

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111112", "role": "authenticated"}', true);

-- 8. Zmiana samego hero.
select lives_ok(
  $$ select save_article_edit(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbe001',
       '2026-01-01 10:00:00+00',
       'Artykul z obrazami',
       'Lead.',
       '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit."}, {"type": "image", "imageId": "cccccccc-cccc-4ccc-8ccc-cccccccce001"}, {"type": "image", "imageId": "cccccccc-cccc-4ccc-8ccc-cccccccce003"}]}',
       'cccccccc-cccc-4ccc-8ccc-cccccccce002'
     ) $$,
  'redaktor zmienia hero przez save_article_edit'
);

-- 9. Zapis bez zmian (z nowym hero) nie tworzy rewizji.
select is(
  save_article_edit(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbe001',
    (select updated_at from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbe001'),
    'Artykul z obrazami',
    'Lead.',
    '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit."}, {"type": "image", "imageId": "cccccccc-cccc-4ccc-8ccc-cccccccce001"}, {"type": "image", "imageId": "cccccccc-cccc-4ccc-8ccc-cccccccce003"}]}',
    'cccccccc-cccc-4ccc-8ccc-cccccccce002'
  ),
  (select updated_at from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbe001'),
  'zapis bez zmian zwraca dotychczasowy updated_at'
);

-- 10. Hero AI przez RPC odrzucony.
select throws_ok(
  format(
    $$ select save_article_edit(
         'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbe001',
         %L,
         'Artykul z obrazami',
         'Lead.',
         '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit."}]}',
         'cccccccc-cccc-4ccc-8ccc-cccccccce004'
       ) $$,
    (select updated_at from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbe001')
  ),
  '23514',
  null,
  'save_article_edit z hero AI odrzucony'
);

-- 11. Obraz AI dodany w bloku przez RPC odrzucony.
select throws_ok(
  format(
    $$ select save_article_edit(
         'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbe001',
         %L,
         'Artykul z obrazami',
         'Lead.',
         '{"version": 1, "blocks": [{"type": "image", "imageId": "cccccccc-cccc-4ccc-8ccc-cccccccce004"}]}',
         'cccccccc-cccc-4ccc-8ccc-cccccccce002'
       ) $$,
    (select updated_at from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbe001')
  ),
  '23514',
  null,
  'save_article_edit z blokiem AI odrzucony'
);

-- 12-14. Redaktor nie przerobi uzytego obrazu na niepoprawny ani nie usunie go spod bloku.
select throws_ok(
  $$ update image_assets set is_ai_generated = true where id = 'cccccccc-cccc-4ccc-8ccc-cccccccce001' $$,
  '23514',
  null,
  'obrazu uzytego w bloku nie da sie oznaczyc jako AI'
);

select throws_ok(
  $$ update image_assets set kind = 'portrait' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccce002' $$,
  '23514',
  null,
  'hero uzytego w artykule nie da sie zmienic na inny rodzaj'
);

select throws_ok(
  $$ delete from image_assets where id = 'cccccccc-cccc-4ccc-8ccc-cccccccce001' $$,
  '23503',
  null,
  'obrazu uzytego w bloku nie da sie usunac'
);

-- 15. Nieuzywany obraz redaktor oznacza i usuwa bez przeszkod.
select lives_ok(
  $$ update image_assets set is_ai_generated = true where id = 'cccccccc-cccc-4ccc-8ccc-cccccccce005';
     delete from image_assets where id = 'cccccccc-cccc-4ccc-8ccc-cccccccce005' $$,
  'nieuzywany obraz mozna oznaczyc jako AI i usunac'
);

reset role;

-- 16-19. Stan po edycji.
select is(
  (select hero_image_id from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbe001'),
  'cccccccc-cccc-4ccc-8ccc-cccccccce002'::uuid,
  'artykul ma nowe hero'
);

select is(
  (select count(*) from article_revisions where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbe001'),
  1::bigint,
  'jedna rewizja: zapis bez zmian i odrzucone edycje jej nie tworza'
);

select is(
  (select hero_image_id from article_revisions where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbe001'),
  'cccccccc-cccc-4ccc-8ccc-cccccccce001'::uuid,
  'rewizja zapisuje hero sprzed zmiany'
);

select ok(
  (select seo_title is not null and seo_description is not null from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbe001'),
  'zmiana samego hero nie czysci SEO'
);

-- 20. Edycja tresci bez nowych obrazow przechodzi takze wtedy, gdy obraz w bloku zostaje.
select lives_ok(
  $$ update articles
     set content = jsonb_set(content, '{blocks,0,text}', '"Akapit poprawiony."')
     where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbe001' $$,
  'edycja tresci z istniejacym obrazem w bloku przechodzi'
);

select ok(
  not has_function_privilege('anon', 'save_article_edit(uuid, timestamptz, text, text, jsonb, uuid)', 'execute'),
  'anon nie ma execute na save_article_edit'
);

select hasnt_function(
  'public',
  'save_article_edit',
  array['uuid', 'timestamp with time zone', 'text', 'text', 'jsonb'],
  'stara sygnatura bez hero nie istnieje'
);

select * from finish();

rollback;
