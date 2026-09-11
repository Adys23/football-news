-- Uzytkownik anonimowy widzi wylacznie tresc opublikowana i dane publiczne.
-- Cala warstwa produkcyjna (zrodla, historie, fakty, kolejka) musi byc dla niego
-- niewidoczna - to zabezpieczenie przed wyciekiem materialu roboczego.

begin;

create extension if not exists pgtap;

select plan(10);

insert into stories (id, title, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Historia opublikowana', 'published'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Historia w pracy', 'drafting');

insert into articles (id, story_id, title, slug, status, approved_by, published_at)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'Artykul opublikowany o transferze',
  'artykul-opublikowany-o-transferze',
  'published',
  '11111111-1111-4111-8111-111111111111',
  now()
);

insert into articles (id, story_id, title, slug, status)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  'Szkic artykulu niewidoczny publicznie',
  'szkic-artykulu-niewidoczny-publicznie',
  'draft'
);

insert into transfers (id, player_id, to_club_id, status, season, confirmed_by_source_id)
values (
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  '66666666-6666-4666-8666-666666666662',
  '55555555-5555-4555-8555-555555555551',
  'official',
  '2026/27',
  (select id from sources where name = 'BBC Sport Football')
);

insert into transfers (id, player_id, to_club_id, status, season)
values (
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
  '66666666-6666-4666-8666-666666666661',
  '55555555-5555-4555-8555-555555555552',
  'rumour',
  '2026/27'
);

-- Uprawnienia tabelowe sa nadawane domyslnie przez Supabase,
-- wiec jedyna bariera dla anon jest RLS. To zalozenie tez sprawdzamy.
select ok(
  has_table_privilege('anon', 'articles', 'select'),
  'anon ma uprawnienie select na articles - dostep reguluje RLS'
);

set local role anon;

select is(
  (select count(*) from articles),
  1::bigint,
  'anon widzi tylko artykuly opublikowane'
);

select is(
  (select count(*) from transfers),
  1::bigint,
  'anon widzi tylko transfery oficjalnie potwierdzone'
);

select is((select count(*) from sources), 0::bigint, 'anon nie widzi zrodel');
select is((select count(*) from source_items), 0::bigint, 'anon nie widzi materialu zrodlowego');
select is((select count(*) from stories), 0::bigint, 'anon nie widzi historii');
select is((select count(*) from facts), 0::bigint, 'anon nie widzi faktow');
select is((select count(*) from jobs), 0::bigint, 'anon nie widzi kolejki zadan');
select is((select count(*) from settings), 0::bigint, 'anon nie widzi konfiguracji');

-- Kluby i zawodnicy sa publiczna baza wiedzy.
select ok((select count(*) from clubs) > 0, 'anon widzi kluby');

reset role;

select * from finish();

rollback;
