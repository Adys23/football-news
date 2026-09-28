-- 0009_public_provenance.test.sql
-- Migracja 0021: strona publiczna czyta zrodla i fakty opublikowanego artykulu
-- przez funkcje security definer, ktore nie odslaniaja warstwy produkcyjnej
-- ani materialu, ktorego redaktor nie widzial przy publikacji.
-- Aktualizacja artykulu bez akceptacji redaktora nie jest publiczna.

begin;

create extension if not exists pgtap;

select plan(14);

insert into stories (id, title, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91', 'Historia opublikowana', 'published'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa92', 'Historia w recenzji', 'review');

insert into facts (id, story_id, subject, predicate, statement_pl, confidence)
values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee91', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91', 'Zawodnik', 'transfer', 'Fakt z fact_box.', 0.9),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee92', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91', 'Zawodnik', 'fee', 'Fakt spoza tresci.', 0.5),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee94', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa92', 'Zawodnik', 'transfer', 'Fakt innej historii.', 0.9);

-- Zastapiony nowsza ekstrakcja, ale wskazany w opublikowanej tresci: czytelnik
-- widzi to, co zatwierdzil redaktor.
insert into facts (id, story_id, subject, predicate, statement_pl, confidence, superseded_by)
values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee93', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91', 'Zawodnik', 'contract', 'Fakt zastapiony z fact_box.', 0.9, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee91');

-- Nowa ocena po publikacji zatwierdza fakt spoza tresci - nie moze go to odslonic.
insert into story_assessments (story_id, publishability, confidence, approved_fact_ids)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91',
  'auto',
  0.9,
  array['eeeeeeee-eeee-4eee-8eee-eeeeeeeeee91', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee92']::uuid[]
);

insert into articles (id, story_id, title, slug, content, status, approved_by)
values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91',
    'Artykul opublikowany',
    'artykul-opublikowany-pochodzenie',
    '{"version": 1, "blocks": [
      {"type": "paragraph", "text": "Akapit."},
      {"type": "fact_box", "factIds": ["EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEE91", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee93", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee94"]}
    ]}',
    'published',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb92',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa92',
    'Artykul w recenzji',
    'artykul-w-recenzji-pochodzenie',
    '{"version": 1, "blocks": [{"type": "fact_box", "factIds": ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeee94"]}]}',
    'review',
    null
  );

insert into source_items (id, source_id, url, title, title_normalized, hash, content, raw_data)
values
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddd91',
    (select id from sources where name = 'BBC Sport Football'),
    'https://www.bbc.com/sport/football/1',
    'Material zrodlowy',
    'material zrodlowy',
    'hash-provenance-1',
    'Pelna tresc zrodla, ktora nie moze wyjsc na zewnatrz.',
    '{"internal": true}'
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddd92',
    (select id from sources where name = 'BBC Sport Football'),
    'javascript:alert(1)',
    'Material z niebezpiecznym adresem',
    'material z niebezpiecznym adresem',
    'hash-provenance-2',
    null,
    null
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddd93',
    (select id from sources where name = 'BBC Sport Football'),
    'https://www.bbc.com/sport/football/3',
    'Material historii w recenzji',
    'material historii w recenzji',
    'hash-provenance-3',
    null,
    null
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddd94',
    (select id from sources where name = 'BBC Sport Football'),
    'https://www.bbc.com/sport/football/4',
    'Material dopiety po publikacji',
    'material dopiety po publikacji',
    'hash-provenance-4',
    null,
    null
  );

insert into story_sources (story_id, source_item_id, created_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91', 'dddddddd-dddd-4ddd-8ddd-dddddddddd91', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91', 'dddddddd-dddd-4ddd-8ddd-dddddddddd92', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa92', 'dddddddd-dddd-4ddd-8ddd-dddddddddd93', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa91', 'dddddddd-dddd-4ddd-8ddd-dddddddddd94', now() + interval '1 hour');

insert into article_updates (article_id, body, approved_by, published_at)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91', 'Aktualizacja zaakceptowana.', '11111111-1111-4111-8111-111111111111', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91', 'Aktualizacja bez akceptacji.', null, now() + interval '2 hours');

select is(
  pg_get_function_result('public_article_sources(uuid)'::regprocedure),
  'TABLE(source_name text, source_type source_type, title text, url text, published_at timestamp with time zone)',
  'public_article_sources zwraca tylko kolumny publiczne (bez trust_score, content, raw_data)'
);

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public_article_facts(uuid)'::regprocedure)
  and (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public_article_sources(uuid)'::regprocedure),
  'obie funkcje sa security definer z pustym search_path'
);

set local role anon;

select results_eq(
  $$ select url from public_article_sources('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91') $$,
  $$ values ('https://www.bbc.com/sport/football/1'::text) $$,
  'anon widzi zrodla z chwili publikacji, bez adresow spoza http(s) i bez materialu dopietego pozniej'
);

select is(
  (select source_name from public_article_sources('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91')),
  'BBC Sport Football',
  'zrodlo ma nazwe czytelna dla odbiorcy'
);

select is(
  (select count(*) from public_article_sources('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb92')),
  0::bigint,
  'artykul nieopublikowany nie ujawnia zrodel'
);

select results_eq(
  $$ select id, statement_pl from public_article_facts('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91') $$,
  $$ values
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee91'::uuid, 'Fakt z fact_box.'::text),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee93'::uuid, 'Fakt zastapiony z fact_box.'::text) $$,
  'anon widzi tylko fakty z fact_box tresci tej historii, niezaleznie od nowej oceny'
);

select is(
  (select count(*) from public_article_facts('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb92')),
  0::bigint,
  'artykul nieopublikowany nie ujawnia faktow'
);

select is(
  (select count(*) from public_article_facts('00000000-0000-4000-8000-000000000000')),
  0::bigint,
  'nieistniejacy artykul nie zwraca faktow'
);

select results_eq(
  $$ select body from article_updates where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91' $$,
  $$ values ('Aktualizacja zaakceptowana.'::text) $$,
  'anon widzi tylko aktualizacje zaakceptowane przez redaktora'
);

select is((select count(*) from facts), 0::bigint, 'anon nadal nie widzi tabeli facts');
select is((select count(*) from source_items), 0::bigint, 'anon nadal nie widzi source_items');

reset role;

-- Redakcja widzi aktualizacje bez akceptacji, bo to jej kolejka.
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-4111-8111-111111111112", "role": "authenticated"}';

select is(
  (select count(*) from article_updates where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91'),
  2::bigint,
  'redaktor widzi takze aktualizacje bez akceptacji'
);

reset role;

-- Niezaakceptowana aktualizacja nie odslania materialu dopietego po publikacji,
-- zaakceptowana pozniejsza - tak.
set local role anon;

select is(
  (select count(*) from public_article_sources('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91')),
  1::bigint,
  'aktualizacja bez akceptacji nie odslania nowych zrodel'
);

reset role;

update article_updates
set approved_by = '11111111-1111-4111-8111-111111111111'
where body = 'Aktualizacja bez akceptacji.';

set local role anon;

select is(
  (select count(*) from public_article_sources('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb91')),
  2::bigint,
  'zaakceptowana aktualizacja odslania zrodla dopiete przed nia'
);

reset role;

select * from finish();

rollback;
