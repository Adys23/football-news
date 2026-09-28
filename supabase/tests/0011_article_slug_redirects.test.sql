-- 0011_article_slug_redirects.test.sql
-- Migracja 0023: zmiana sluga artykulu, ktory byl opublikowany, zapisuje stary slug
-- w article_redirects. Wpisy wskazuja artykul, wiec kolejne zmiany nie tworza lancucha,
-- a powrot do starego sluga usuwa jego wpis.

begin;

create extension if not exists pgtap;

select plan(20);

select has_trigger('public', 'articles', 'articles_record_slug_redirect', 'trigger na articles');
select function_privs_are(
  'public', 'record_article_slug_redirect', array[]::text[], 'authenticated', array[]::text[],
  'funkcja triggera nie jest wywolywalna z sesji'
);

insert into stories (id, title, status)
select ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaac0' || n)::uuid, 'Historia przekierowan ' || n, 'review'
from generate_series(1, 4) as n;

-- 1: opublikowany, 2: opublikowany (przejmie zwolniony slug), 3: szkic, 4: zarchiwizowany.
insert into articles (id, story_id, title, slug, lead, content, status, category_id, approved_by, published_at)
select
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd0' || n)::uuid,
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaac0' || n)::uuid,
  'Artykul przekierowan ' || n,
  'przekierowanie-' || n,
  'Lead artykulu.',
  '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit."}]}',
  case n when 3 then 'draft' when 4 then 'archived' else 'published' end::article_status,
  '33333333-3333-4333-8333-333333333331',
  case when n = 3 then null else '11111111-1111-4111-8111-111111111111'::uuid end,
  case when n = 3 then null else '2026-01-01 10:00:00+00'::timestamptz end
from generate_series(1, 4) as n;

create or replace function pg_temp.redirects() returns table (old_slug text, article_id uuid)
language sql as $$
  select r.old_slug, r.article_id
  from article_redirects r
  where r.article_id::text like 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd0%'
  order by r.old_slug
$$;

-- 3. Szkic: adres nigdy nie byl publiczny.
update articles set slug = 'szkic-nowy' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd03';
select is((select count(*) from pg_temp.redirects()), 0::bigint, 'zmiana sluga szkicu bez przekierowania');

-- 4. Zmiana innych kolumn opublikowanego nie tworzy wpisu.
update articles set title = 'Nowy tytul', category_id = '33333333-3333-4333-8333-333333333332'
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01';
select is((select count(*) from pg_temp.redirects()), 0::bigint, 'zmiana tytulu i kategorii bez wpisu');

-- 5. Update sluga na ten sam nie tworzy wpisu.
update articles set slug = slug where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01';
select is((select count(*) from pg_temp.redirects()), 0::bigint, 'slug bez zmiany bez wpisu');

-- 6-7. Z sesji redaktora: A -> B zapisuje A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111112", "role": "authenticated"}', true);

select lives_ok(
  $$ update articles set slug = 'przekierowanie-1-b' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01' $$,
  'redaktor zmienia slug opublikowanego artykulu'
);

reset role;

select results_eq(
  $$ select old_slug, article_id from pg_temp.redirects() $$,
  $$ values ('przekierowanie-1'::text, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01'::uuid) $$,
  'stary slug wskazuje artykul'
);

-- 8. B -> C: oba stare slugi wskazuja ten sam artykul, bez lancucha.
update articles set slug = 'przekierowanie-1-c' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01';
select results_eq(
  $$ select old_slug, article_id from pg_temp.redirects() $$,
  $$ values
    ('przekierowanie-1'::text, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01'::uuid),
    ('przekierowanie-1-b'::text, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01'::uuid) $$,
  'A i B wskazuja artykul o slugu C'
);

-- 9-10. Powrot C -> A usuwa wpis A i dodaje C.
update articles set slug = 'przekierowanie-1' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01';
select results_eq(
  $$ select old_slug from pg_temp.redirects() $$,
  $$ values ('przekierowanie-1-b'::text), ('przekierowanie-1-c'::text) $$,
  'powrot do starego sluga usuwa jego wpis'
);
select is(
  (select count(*) from pg_temp.redirects() r join articles a on a.slug = r.old_slug),
  0::bigint,
  'zaden aktualny slug nie przekierowuje'
);

-- 11. Ponowienie tej samej zmiany jest idempotentne.
update articles set slug = 'przekierowanie-1-c' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01';
update articles set slug = 'przekierowanie-1' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01';
select results_eq(
  $$ select old_slug from pg_temp.redirects() $$,
  $$ values ('przekierowanie-1-b'::text), ('przekierowanie-1-c'::text) $$,
  'ponowienie zmian daje te same wpisy'
);

-- 12. Slug zwolniony przez artykul 1 przejmuje artykul 2, a potem go zmienia:
-- stary adres wskazuje ostatniego wlasciciela.
update articles set slug = 'przekierowanie-1-b' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd02';
update articles set slug = 'przekierowanie-2-nowy' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd02';
select results_eq(
  $$ select old_slug, article_id from pg_temp.redirects() where old_slug in ('przekierowanie-2', 'przekierowanie-1-b') $$,
  $$ values
    ('przekierowanie-1-b'::text, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd02'::uuid),
    ('przekierowanie-2'::text, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd02'::uuid) $$,
  'przejety slug wskazuje ostatniego wlasciciela'
);

-- 12a. Artykul 2 zajmuje slug, ktory przekierowywal do artykulu 1 (i go nie zwalnia):
-- wpis znika, a adres nalezy do artykulu 2, nawet gdy ten nie jest opublikowany.
update articles set slug = 'przekierowanie-1-c' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd03';
select is(
  (select count(*) from article_redirects where old_slug = 'przekierowanie-1-c'),
  0::bigint,
  'slug zajety przez inny artykul nie przekierowuje do poprzedniego wlasciciela'
);

-- 12b. Nowy artykul z zajetym wczesniej slugiem tez przejmuje adres (trigger na insert).
insert into stories (id, title, status)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaac09', 'Historia nowego artykulu', 'review');
insert into articles (id, story_id, title, slug, lead, content, status)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccc09',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaac09',
  'Nowy artykul',
  'przekierowanie-2',
  'Lead artykulu.',
  '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit."}]}',
  'draft'
);
select is(
  (select count(*) from article_redirects where old_slug = 'przekierowanie-2'),
  0::bigint,
  'nowy artykul z dawnym slugiem usuwa przekierowanie'
);

-- 13. Zarchiwizowany (z published_at) mogl byc zaindeksowany.
update articles set slug = 'przekierowanie-4-nowy' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd04';
select is(
  (select article_id from pg_temp.redirects() where old_slug = 'przekierowanie-4'),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd04'::uuid,
  'zmiana sluga zarchiwizowanego zapisuje przekierowanie'
);

-- 14. Webhook z 0022 nadal dostaje previous_slug (trigger nie przerywa update'u).
select is(
  (select slug from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd04'),
  'przekierowanie-4-nowy',
  'update sluga przechodzi'
);

-- 15-16. Anon czyta przekierowania (strona publiczna), ale nie moze ich zmieniac.
set local role anon;
select is(
  (select count(*) from article_redirects where old_slug = 'przekierowanie-1-b'),
  1::bigint,
  'anon widzi przekierowanie'
);
select throws_ok(
  $$ insert into article_redirects (old_slug, article_id) values ('podrobka', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01') $$,
  '42501',
  null,
  'anon nie dopisze przekierowania'
);
reset role;

-- 17. publish_article (0021) po zmianie sluga w review nie tworzy wpisu dla szkicu.
update articles set status = 'review', slug = 'szkic-przed-publikacja' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd03';
select is(
  (select count(*) from pg_temp.redirects() where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd03'),
  0::bigint,
  'artykul przed publikacja nie ma przekierowan'
);

-- 18. Usuniecie artykulu usuwa jego przekierowania (on delete cascade).
delete from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01';
select is(
  (select count(*) from pg_temp.redirects() where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01'),
  0::bigint,
  'usuniecie artykulu usuwa jego przekierowania'
);

select * from finish();

rollback;
