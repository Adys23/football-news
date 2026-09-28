-- 0024_reserved_category_slugs.sql
-- Kategoria ma adres /<slug> (app/(site)/[category]), a statyczne segmenty pierwszego
-- poziomu w app/ maja pierwszenstwo przed [category]. Kategoria o takim slugu bylaby
-- niedostepna, a jej artykuly trafialyby pod cudza trase, wiec baza odrzuca taki slug.
--
-- Lista MUSI byc zgodna z RESERVED_PATH_SEGMENTS w lib/public/paths.ts (stala wchodzi
-- z PR #26; stan z galezi claude/pr44-sitemap). Nowy statyczny
-- segment pierwszego poziomu to wpis tam i nowa migracja, ktora usuwa i dodaje ten
-- constraint (dodanie sprawdza istniejace wiersze). Segmenty z kropka tez sa na liscie,
-- bo baza nie wymusza formatu sluga.
--
-- Slugi klubow, zawodnikow i autorow zyja pod /kluby, /zawodnicy i /autorzy, wiec nie
-- koliduja z pierwszym poziomem i nie potrzebuja tej blokady.

alter table public.categories
  add constraint categories_slug_not_reserved check (
    slug <> all (array[
      'admin',
      'login',
      'brak-dostepu',
      'api',
      'zawodnicy',
      'kluby',
      'autorzy',
      'o-nas',
      'sitemap.xml',
      'sitemap-news.xml',
      'robots.txt',
      'feed.xml',
      'rss.xml'
    ]::text[])
  );
