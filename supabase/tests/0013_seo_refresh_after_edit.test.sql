-- 0013_seo_refresh_after_edit.test.sql
-- Migracja 0025: zmiana tytulu albo leadu w save_article_edit czysci pola SEO i kolejkuje
-- jeden GENERATE_SEO w trybie odswiezenia. Zmiana samej tresci niczego nie rusza.

begin;

create extension if not exists pgtap;

select plan(18);

insert into stories (id, title, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaad01', 'Historia do edycji tytulu', 'review'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaad02', 'Historia do edycji tresci', 'review');

insert into articles (
  id, story_id, title, slug, lead, content, status, seo_title, seo_description, updated_at
)
values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaad01',
    'Bruno Fernandes przedluzyl kontrakt do 2029 roku',
    'bruno-fernandes-przedluzyl-kontrakt',
    'Lead od modelu.',
    '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit modelu."}]}',
    'review',
    'Bruno Fernandes z kontraktem do 2029 roku',
    repeat('Opis SEO od modelu. ', 7),
    '2026-01-01 10:00:00+00'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd02',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaad02',
    'Tytul bez zmian',
    'tytul-bez-zmian',
    'Lead bez zmian.',
    '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit modelu."}]}',
    'review',
    'Tytul SEO bez zmian',
    repeat('Opis SEO bez zmian. ', 7),
    '2026-01-01 10:00:00+00'
  );

-- === Sesja redaktora ===

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111112", "role": "authenticated"}', true);

-- 1. Zmiana samej tresci.
select lives_ok(
  $$ select save_article_edit(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd02',
       '2026-01-01 10:00:00+00',
       'Tytul bez zmian',
       'Lead bez zmian.',
       '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit redaktora."}]}'
     ) $$,
  'redaktor zapisuje zmiane samej tresci'
);

-- 2. Zmiana tytulu.
select lives_ok(
  $$ select save_article_edit(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01',
       '2026-01-01 10:00:00+00',
       'Bruno Fernandes przedluzyl kontrakt do 2028 roku',
       'Lead od modelu.',
       '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit modelu."}]}'
     ) $$,
  'redaktor zapisuje zmiane tytulu'
);

-- 3. Druga edycja (lead) przed przetworzeniem joba.
select lives_ok(
  format(
    $$ select save_article_edit(
         'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01',
         %L,
         'Bruno Fernandes przedluzyl kontrakt do 2028 roku',
         'Lead redaktora.',
         '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit modelu."}]}'
       ) $$,
    (select updated_at from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01')
  ),
  'redaktor zapisuje druga edycje leadu'
);

-- 4. Helper nie kolejkuje, gdy SEO jest uzupelnione.
select is(
  enqueue_seo_refresh('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd02'),
  null,
  'enqueue_seo_refresh nic nie robi przy uzupelnionym SEO'
);

reset role;

select is(
  (
    select row(seo_title, seo_description)::text
    from articles
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01'
  ),
  row(null::text, null::text)::text,
  'zmiana tytulu czysci seo_title i seo_description'
);

select is(
  (select slug from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01'),
  'bruno-fernandes-przedluzyl-kontrakt',
  'edycja nie zmienia sluga'
);

select is(
  (
    select count(*)
    from jobs
    where type = 'GENERATE_SEO'
      and article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01'
  ),
  1::bigint,
  'dwie edycje przed przetworzeniem daja jeden job GENERATE_SEO'
);

select is(
  (
    select payload::text || ' | ' || dedupe_key || ' | ' || status::text || ' | ' || story_id::text
    from jobs
    where type = 'GENERATE_SEO'
      and article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01'
  ),
  '{"articleId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01"} | GENERATE_SEO:refresh:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01 | queued | aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaad01',
  'job ma payload z kontraktu i staly dedupe_key'
);

select is(
  (
    select seo_title || ' | ' || (content #>> '{blocks,0,text}')
    from articles
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd02'
  ),
  'Tytul SEO bez zmian | Akapit redaktora.',
  'zmiana samej tresci zostawia SEO'
);

select is(
  (select count(*) from jobs where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd02'),
  0::bigint,
  'zmiana samej tresci niczego nie kolejkuje'
);

-- Job zakonczony: kolejna zmiana tytulu kolejkuje nowe odswiezenie.
update articles
set seo_title = 'Bruno Fernandes z kontraktem do 2028 roku',
    seo_description = repeat('Nowy opis SEO modelu. ', 7)
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01';

update jobs
set status = 'done'
where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111112", "role": "authenticated"}', true);

select lives_ok(
  format(
    $$ select save_article_edit(
         'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01',
         %L,
         'Bruno Fernandes zostaje w Manchesterze do 2028 roku',
         'Lead redaktora.',
         '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit modelu."}]}'
       ) $$,
    (select updated_at from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01')
  ),
  'redaktor zmienia tytul po przetworzeniu odswiezenia'
);

reset role;

select is(
  (
    select count(*)
    from jobs
    where type = 'GENERATE_SEO'
      and article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01'
      and status = 'queued'
  ),
  1::bigint,
  'po zakonczonym odswiezeniu kolejna edycja kolejkuje nowy job'
);

-- Job w toku (np. zapisal juz SEO i czeka na complete_job) nie blokuje odswiezenia kolejnej edycji.
update jobs
set status = 'running'
where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01'
  and status = 'queued';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111112", "role": "authenticated"}', true);

select lives_ok(
  format(
    $$ select save_article_edit(
         'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01',
         %L,
         'Bruno Fernandes zostaje w Manchesterze United do 2028 roku',
         'Lead redaktora.',
         '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit modelu."}]}'
       ) $$,
    (select updated_at from articles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01')
  ),
  'redaktor zmienia tytul, gdy odswiezenie jest w toku'
);

reset role;

select is(
  (
    select string_agg(status::text || ':' || coalesce(dedupe_key, '-'), ', ' order by status)
    from jobs
    where type = 'GENERATE_SEO'
      and article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01'
      and status in ('queued', 'running')
  ),
  'queued:GENERATE_SEO:refresh:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01, running:-',
  'job w toku zostaje odpiety od klucza, nowy czeka w kolejce'
);

-- === Sesja czytelnika ===

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111113", "role": "authenticated"}', true);

select throws_ok(
  $$ select enqueue_seo_refresh('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01') $$,
  '42501',
  null,
  'viewer nie kolejkuje odswiezenia SEO'
);

reset role;

select ok(
  not has_function_privilege('anon', 'enqueue_seo_refresh(uuid)', 'execute'),
  'anon nie ma execute na enqueue_seo_refresh'
);

select ok(
  has_function_privilege('authenticated', 'enqueue_seo_refresh(uuid)', 'execute'),
  'authenticated ma execute na enqueue_seo_refresh'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    where p.oid = 'enqueue_seo_refresh(uuid)'::regprocedure
  ),
  true,
  'enqueue_seo_refresh dziala jako definer'
);

select * from finish();

rollback;
