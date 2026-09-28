-- 0010_revalidate_webhook.test.sql
-- Migracja 0022: zmiana widocznej tresci artykulu kolejkuje w pg_net POST na
-- /api/revalidate z sekretem z Vault. Bez konfiguracji publikacja przechodzi bez webhooka.
-- Kolejka pg_net jest transakcyjna, a test konczy sie rollbackiem, wiec nic nie wychodzi w siec.

begin;

create extension if not exists pgtap;

select plan(22);

select has_function('public', 'send_revalidate_webhook', array['jsonb'], 'funkcja wysylajaca webhook istnieje');
select has_trigger('public', 'articles', 'articles_revalidate_webhook', 'trigger na articles');
select has_trigger('public', 'article_updates', 'article_updates_revalidate_webhook', 'trigger na article_updates');
select has_extension('pg_net', 'pg_net zainstalowany');

select function_privs_are(
  'public', 'send_revalidate_webhook', array['jsonb'], 'authenticated', array[]::text[],
  'redaktor nie wywola webhooka z pominieciem triggera'
);

insert into stories (id, title, status)
select ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab0' || n)::uuid, 'Historia webhooka ' || n, 'review'
from generate_series(1, 4) as n;

insert into articles (id, story_id, title, slug, lead, content, status, category_id, approved_by, updated_at)
select
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc0' || n)::uuid,
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab0' || n)::uuid,
  'Artykul webhooka ' || n,
  'artykul-webhooka-' || n,
  'Lead artykulu.',
  '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit."}]}',
  'review',
  '33333333-3333-4333-8333-333333333331',
  '11111111-1111-4111-8111-111111111111',
  '2026-01-01 10:00:00+00'
from generate_series(1, 4) as n;

create temporary table webhook_baseline as
select coalesce(max(id), 0) as last_id from net.http_request_queue;

create or replace function pg_temp.webhooks() returns table (url text, secret text, payload jsonb)
language sql as $$
  select q.url, q.headers ->> 'x-webhook-secret', convert_from(q.body, 'UTF8')::jsonb
  from net.http_request_queue q
  where q.id > (select last_id from webhook_baseline)
  order by q.id
$$;

create or replace function pg_temp.reset_webhooks() returns void
language sql as $$
  update webhook_baseline set last_id = coalesce((select max(id) from net.http_request_queue), 0)
$$;

-- === Bez sekretow w Vault ===

-- 6-7. Publikacja przechodzi, nic nie trafia do kolejki.
select lives_ok(
  $$ update articles set status = 'published' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc01' $$,
  'publikacja bez konfiguracji webhooka przechodzi'
);
select is((select count(*) from pg_temp.webhooks()), 0::bigint, 'bez sekretow webhook nie jest kolejkowany');

-- === Z sekretami w Vault ===

select vault.create_secret('http://127.0.0.1:3000/api/revalidate', 'revalidate_webhook_url');
select vault.create_secret('sekret-testowy', 'revalidate_webhook_secret');

-- 8-10. Publikacja z sesji redaktora (publish_article z 0021) kolejkuje webhook z sekretem.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111112", "role": "authenticated"}', true);

select lives_ok(
  $$ select publish_article('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc02', '2026-01-01 10:00:00+00') $$,
  'redaktor publikuje artykul'
);

reset role;

select results_eq(
  $$ select url, secret from pg_temp.webhooks() $$,
  $$ values ('http://127.0.0.1:3000/api/revalidate'::text, 'sekret-testowy'::text) $$,
  'publikacja kolejkuje jeden webhook na URL z Vault z naglowkiem x-webhook-secret'
);

select is(
  (select payload from pg_temp.webhooks()),
  '{"event": "publish", "slug": "artykul-webhooka-2", "previous_slug": null, "category_slug": "transfery", "previous_category_slug": null}'::jsonb,
  'payload publikacji: slug i kategoria'
);

-- 11. Zmiana nieopublikowanego artykulu nie wysyla webhooka.
select pg_temp.reset_webhooks();
update articles set title = 'Inny tytul' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc03';
select is((select count(*) from pg_temp.webhooks()), 0::bigint, 'zmiana artykulu w review bez webhooka');

-- 12. Update bez zmiany tresci (podbija tylko updated_at) nie wysyla webhooka.
update articles set title = title where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc02';
select is((select count(*) from pg_temp.webhooks()), 0::bigint, 'no-op update opublikowanego bez webhooka');

-- 13. Zmiana tresci opublikowanego.
update articles set lead = 'Nowy lead.' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc02';
select is(
  (select payload ->> 'event' from pg_temp.webhooks()),
  'update',
  'zmiana tresci opublikowanego kolejkuje webhook update'
);

-- 14. Zmiana sluga i kategorii przekazuje stare wartosci.
select pg_temp.reset_webhooks();
update articles
set slug = 'artykul-webhooka-2-nowy', category_id = '33333333-3333-4333-8333-333333333332'
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc02';
select is(
  (select payload from pg_temp.webhooks()),
  jsonb_build_object(
    'event', 'update',
    'slug', 'artykul-webhooka-2-nowy',
    'previous_slug', 'artykul-webhooka-2',
    'category_slug', (select slug from categories where id = '33333333-3333-4333-8333-333333333332'),
    'previous_category_slug', 'transfery'
  ),
  'zmiana sluga i kategorii: nowy i poprzedni slug w payloadzie'
);

-- 15. Wpis w article_updates opublikowanego artykulu.
select pg_temp.reset_webhooks();
insert into article_updates (article_id, body)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc02', 'Klub potwierdzil transfer.');
select is(
  (select payload ->> 'slug' from pg_temp.webhooks()),
  'artykul-webhooka-2-nowy',
  'aktualizacja opublikowanego artykulu kolejkuje webhook'
);

-- 16. article_updates nieopublikowanego artykulu - bez webhooka.
select pg_temp.reset_webhooks();
insert into article_updates (article_id, body)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc03', 'Aktualizacja szkicu.');
select is((select count(*) from pg_temp.webhooks()), 0::bigint, 'aktualizacja nieopublikowanego bez webhooka');

-- 17. Wycofanie z publikacji.
update articles set status = 'archived' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc02';
select is(
  (select payload ->> 'event' from pg_temp.webhooks()),
  'unpublish',
  'archiwizacja opublikowanego kolejkuje webhook unpublish'
);

-- 18. Usuniecie opublikowanego artykulu.
select pg_temp.reset_webhooks();
update articles set status = 'published' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc04';
select pg_temp.reset_webhooks();
delete from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc04';
select results_eq(
  $$ select payload ->> 'event', payload ->> 'slug' from pg_temp.webhooks() $$,
  $$ values ('unpublish'::text, 'artykul-webhooka-4'::text) $$,
  'usuniecie opublikowanego kolejkuje jeden webhook unpublish'
);

-- 19. Artykul bez kategorii: category_slug = null, webhook dalej wychodzi.
select pg_temp.reset_webhooks();
update articles set category_id = null where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc01';
select is(
  (select payload -> 'category_slug' from pg_temp.webhooks()),
  'null'::jsonb,
  'bez kategorii category_slug jest null'
);

-- 20-21. Blad pg_net (niepoprawny URL) nie blokuje publikacji.
select vault.update_secret((select id from vault.secrets where name = 'revalidate_webhook_url'), 'to nie jest url');
select pg_temp.reset_webhooks();
select lives_ok(
  $$ update articles set status = 'published' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc03' $$,
  'publikacja przechodzi mimo bledu webhooka'
);
select is(
  (select status from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc03'),
  'published'::article_status,
  'artykul jest opublikowany mimo bledu webhooka'
);

-- 22. Pusty sekret wylacza webhook.
select vault.update_secret((select id from vault.secrets where name = 'revalidate_webhook_secret'), '');
select vault.update_secret((select id from vault.secrets where name = 'revalidate_webhook_url'), 'http://127.0.0.1:3000/api/revalidate');
select pg_temp.reset_webhooks();
update articles set lead = 'Kolejny lead.' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbc03';
select is((select count(*) from pg_temp.webhooks()), 0::bigint, 'pusty sekret wylacza webhook');

select * from finish();

rollback;
