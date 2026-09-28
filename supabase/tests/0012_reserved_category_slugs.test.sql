-- 0012_reserved_category_slugs.test.sql
-- Migracja 0024: slug kategorii nie moze byc statycznym segmentem pierwszego poziomu
-- (RESERVED_PATH_SEGMENTS w lib/public/paths.ts), ani przy wstawieniu, ani przy zmianie.

begin;

create extension if not exists pgtap;

select plan(10);

select col_has_check('public', 'categories', 'slug', 'categories.slug ma constraint check');

select is(
  (select count(*)::int from categories
   where slug in ('admin', 'login', 'brak-dostepu', 'api', 'zawodnicy', 'kluby', 'autorzy',
                  'o-nas', 'sitemap.xml', 'sitemap-news.xml', 'robots.txt', 'feed.xml', 'rss.xml')),
  0,
  'seed nie ma kategorii z zarezerwowanym slugiem'
);

select throws_ok(
  $$ insert into categories (name, slug) values ('Panel', 'admin') $$,
  '23514',
  'new row for relation "categories" violates check constraint "categories_slug_not_reserved"',
  'wstawienie kategorii admin jest blokowane'
);

select throws_ok(
  $$ insert into categories (name, slug) values ('Zawodnicy', 'zawodnicy') $$,
  '23514',
  'new row for relation "categories" violates check constraint "categories_slug_not_reserved"',
  'wstawienie kategorii zawodnicy jest blokowane'
);

select throws_ok(
  $$ insert into categories (name, slug) values ('Sitemapa', 'sitemap.xml') $$,
  '23514',
  'new row for relation "categories" violates check constraint "categories_slug_not_reserved"',
  'wstawienie kategorii z segmentem pliku sitemap.xml jest blokowane'
);

select lives_ok(
  $$ insert into categories (id, name, slug)
     values ('33333333-3333-4333-8333-3333333333c1', 'Liga Mistrzow', 'liga-mistrzow') $$,
  'wstawienie kategorii z poprawnym slugiem przechodzi'
);

select throws_ok(
  $$ update categories set slug = 'o-nas'
     where id = '33333333-3333-4333-8333-3333333333c1' $$,
  '23514',
  'new row for relation "categories" violates check constraint "categories_slug_not_reserved"',
  'zmiana sluga kategorii na o-nas jest blokowana'
);

select throws_ok(
  $$ update categories set slug = 'api'
     where id = '33333333-3333-4333-8333-333333333331' $$,
  '23514',
  'new row for relation "categories" violates check constraint "categories_slug_not_reserved"',
  'zmiana sluga kategorii z seeda na api jest blokowana'
);

select lives_ok(
  $$ update categories set slug = 'liga-mistrzow-uefa'
     where id = '33333333-3333-4333-8333-3333333333c1' $$,
  'zmiana sluga kategorii na poprawny przechodzi'
);

select lives_ok(
  $$ insert into categories (name, slug) values ('Admin news', 'admin-news') $$,
  'slug tylko zaczynajacy sie od zarezerwowanego segmentu przechodzi'
);

select * from finish();

rollback;
