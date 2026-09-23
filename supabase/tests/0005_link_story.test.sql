-- 0005_link_story.test.sql
-- Find-or-create historii w jednym RPC: drugi podobny material dolacza
-- do tej samej historii zamiast tworzyc nowa.

begin;

create extension if not exists pgtap;

select plan(8);

insert into sources (id, name, url, rss_url, kind, type, trust_score, language, country)
values (
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  'Zrodlo testowe clustering',
  'https://example.test/clustering',
  'https://example.test/clustering/rss.xml',
  'rss',
  'major_outlet',
  0.80,
  'en',
  'international'
);

insert into source_items (id, source_id, url, title, title_normalized, hash)
values
  (
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    'https://example.test/a',
    'Lewandowski close to Barcelona transfer',
    'lewandowski close to barcelona transfer',
    'hash-link-story-a'
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    'https://example.test/b',
    'Lewandowski close to a Barcelona transfer deal',
    'lewandowski close to a barcelona transfer deal',
    'hash-link-story-b'
  );

select is(
  (select out_created from link_source_item_to_story(
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
    'transfer',
    null,
    80
  )),
  true,
  'pierwszy material tworzy historie'
);

select is(
  (select out_created from link_source_item_to_story(
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
    'transfer',
    null,
    80
  )),
  false,
  'drugi podobny material dolacza do istniejacej historii'
);

select is(
  (select out_match_method from link_source_item_to_story(
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
    'transfer',
    null,
    80
  )),
  'trigram',
  'ponowne wywolanie jest idempotentne i zostawia match_method trigram'
);

select is(
  (select count(*) from stories where title like 'Lewandowski close%'),
  1::bigint,
  'dwa podobne tytuly daja jedna historie'
);

select is(
  (select count(*) from story_sources where story_id = (
    select id from stories where title like 'Lewandowski close%' limit 1
  )),
  2::bigint,
  'oba materialy sa powiazane z ta sama historia'
);

select is(
  (select processed_at is not null from source_items where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'),
  true,
  'processed_at jest ustawione po powiazaniu'
);

-- Encja: tytuly zbyt rozne na trigram, wspolny zawodnik.
update settings set value = '0.99'::jsonb where key = 'dedupe_similarity_threshold';

insert into players (id, name, slug, full_name, aliases, country, position)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
  'Xylophone Quetzal',
  'xylophone-quetzal',
  'Xylophone Quetzal',
  array['Xylophone Quetzal'],
  'pl',
  'napastnik'
);

insert into source_items (id, source_id, url, title, title_normalized, hash)
values
  (
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd3',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    'https://example.test/c',
    'Xylophone Quetzal signs five year contract',
    'xylophone quetzal signs five year contract',
    'hash-link-story-c'
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd4',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    'https://example.test/d',
    'Medical completed for Xylophone Quetzal this morning',
    'medical completed for xylophone quetzal this morning',
    'hash-link-story-d'
  );

select is(
  (select out_match_method from link_source_item_to_story(
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd3',
    'contract',
    null,
    70
  )),
  'hash',
  'pierwszy material z unikalna encja tworzy historie'
);

select is(
  (select out_match_method from link_source_item_to_story(
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd4',
    'other',
    null,
    70
  )),
  'entity',
  'drugi material z ta sama encja dolacza mimo niskiego trigramu'
);

select * from finish();
rollback;
