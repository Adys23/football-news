-- 0016_quality_report.test.sql
-- Migracja 0028: funkcje raportu jakosci. Dostep tylko dla redakcji, klasyfikacja edycji
-- wylacznie z rewizji redaktora, powod odrzucenia z audit_log, filtr okna, koszt LLM
-- na kategorie z eskalacja wg settings.model_escalation.

begin;

create extension if not exists pgtap;

select plan(30);

-- Okno raportu w testach: od 2026-01-10.
insert into stories (id, title, status, category_id)
select
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaab0' || lpad(n::text, 2, '0'))::uuid,
  'Historia raportu ' || n,
  'review',
  case when n = 10 then '33333333-3333-4333-8333-333333333332'::uuid
       else '33333333-3333-4333-8333-333333333331'::uuid end
from generate_series(1, 11) as n;

-- 1-5 opublikowane w oknie, 6 i 7 odrzucone, 8 opublikowany przed oknem, 9 w recenzji,
-- 10 opublikowany przed oknem, ale oceniony w oknie, 11 zaakceptowany i czeka na publikacje.
insert into articles (
  id, story_id, title, slug, lead, content, status, category_id, approved_by, published_at, created_at
)
select
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb0' || lpad(n::text, 2, '0'))::uuid,
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaab0' || lpad(n::text, 2, '0'))::uuid,
  'Tytul ' || n,
  'raport-jakosci-' || n,
  'Lead ' || n,
  '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit."}]}',
  (case
    when n in (6, 7) then 'rejected'
    when n = 9 then 'review'
    when n = 11 then 'approved'
    else 'published'
  end)::article_status,
  case when n = 10 then '33333333-3333-4333-8333-333333333332'::uuid
       else '33333333-3333-4333-8333-333333333331'::uuid end,
  case when n in (6, 7, 9, 11) then null else '11111111-1111-4111-8111-111111111112'::uuid end,
  case
    when n in (6, 7, 9, 11) then null
    when n = 8 then '2026-01-01 12:00:00+00'::timestamptz
    when n = 10 then '2026-01-03 12:00:00+00'::timestamptz
    else '2026-01-15 12:00:00+00'::timestamptz
  end,
  '2026-01-01 08:00:00+00'::timestamptz + n * interval '1 minute'
from generate_series(1, 11) as n;

-- Artykul 5: stan biezacy po dwoch edycjach ma inna tresc niz przed druga edycja.
update articles
set content = '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit poprawiony."}]}'
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb005';

insert into article_revisions (article_id, title, lead, content, edited_by, created_at)
values
  -- Rewizja modelu z innym tytulem nie jest edycja redaktora.
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001', 'Tytul historii', 'Lead 1',
   '{"version": 1, "blocks": [{"type": "paragraph", "text": "Inny akapit."}]}', null, '2026-01-14 10:00:00+00'),
  -- Tylko tytul.
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002', 'Stary tytul 2', 'Lead 2',
   '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit."}]}',
   '11111111-1111-4111-8111-111111111112', '2026-01-14 10:00:00+00'),
  -- Tylko lead.
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb003', 'Tytul 3', 'Stary lead 3',
   '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit."}]}',
   '11111111-1111-4111-8111-111111111112', '2026-01-14 10:00:00+00'),
  -- Tresc.
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb004', 'Tytul 4', 'Lead 4',
   '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit z literowka."}]}',
   '11111111-1111-4111-8111-111111111112', '2026-01-14 10:00:00+00'),
  -- Dwie edycje: najpierw tytul (T0 -> Tytul 5), potem tresc (Akapit. -> Akapit poprawiony.).
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb005', 'Pierwotny tytul 5', 'Lead 5',
   '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit."}]}',
   '11111111-1111-4111-8111-111111111112', '2026-01-14 10:00:00+00'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb005', 'Tytul 5', 'Lead 5',
   '{"version": 1, "blocks": [{"type": "paragraph", "text": "Akapit."}]}',
   '11111111-1111-4111-8111-111111111112', '2026-01-14 11:00:00+00');

insert into article_scores (
  article_id, factual_accuracy, originality, seo, clickbait, quality, unsupported_claims, checked_at
)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001', 0.95, 0.80, 0.70, 0.05, 0.90, 0, '2026-01-14 09:00:00+00'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb009', 0.60, 0.50, 0.50, 0.20, 0.40, 2, '2026-01-16 09:00:00+00'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb010', 0.90, 0.90, 0.90, 0.00, 0.90, 0, '2026-01-12 09:00:00+00');

-- Artykul 6 odrzucony dwa razy (po powrocie do recenzji), liczy sie ostatnia decyzja.
insert into audit_log (actor_id, action, entity_type, entity_id, diff, created_at)
values
  ('11111111-1111-4111-8111-111111111112', 'reject', 'article', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb006',
   '{"from": "review", "to": "rejected", "reason": "Pierwszy powod"}', '2026-01-05 10:00:00+00'),
  ('11111111-1111-4111-8111-111111111112', 'reject', 'article', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb006',
   '{"from": "review", "to": "rejected", "reason": "Brak potwierdzenia w drugim zrodle"}', '2026-01-12 10:00:00+00'),
  ('11111111-1111-4111-8111-111111111112', 'reject', 'article', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb007',
   '{"from": "review", "to": "rejected"}', '2026-01-02 10:00:00+00');

insert into llm_calls (story_id, stage, model, cost_usd, ok, created_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaab001', 'write', 'gpt-5.6-luna', 0.010000, true, '2026-01-14 08:00:00+00'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaab001', 'validate', 'gpt-5.6-sol', null, false, '2026-01-14 08:05:00+00'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaab010', 'qa', 'gpt-5.6-luna', 0.002000, true, '2026-01-12 08:00:00+00'),
  (null, 'extract', 'gpt-5.6-sol', 0.005000, true, '2026-01-13 08:00:00+00'),
  -- Przed oknem: nie liczy sie.
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaab001', 'write', 'gpt-5.6-luna', 1.000000, true, '2026-01-02 08:00:00+00');

-- === Sesja czytelnika (viewer) ===

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111113", "role": "authenticated"}', true);

-- 1-2
select throws_ok(
  $$ select * from quality_report_articles('2026-01-10 00:00:00+00') $$,
  '42501',
  null,
  'viewer nie czyta raportu artykulow'
);

select throws_ok(
  $$ select * from quality_report_category_totals('2026-01-10 00:00:00+00') $$,
  '42501',
  null,
  'viewer nie czyta agregatow kosztu'
);

reset role;

-- 3
select ok(
  not has_function_privilege('anon', 'quality_report_articles(timestamptz)', 'execute')
    and not has_function_privilege('anon', 'quality_report_category_totals(timestamptz)', 'execute'),
  'anon nie ma execute na funkcjach raportu'
);

-- === Sesja redaktora (editor) ===

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111112", "role": "authenticated"}', true);

create temporary table report on commit drop as
select * from quality_report_articles('2026-01-10 00:00:00+00')
where article_id::text like 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb0%';

-- 4. Filtr okna: 1-5 (publikacja), 6 (odrzucenie), 9 i 11 (czekaja na decyzje), 10 (ocena);
-- bez 7 i 8.
select results_eq(
  $$ select right(article_id::text, 2) from report order by 1 $$,
  $$ values ('01'), ('02'), ('03'), ('04'), ('05'), ('06'), ('09'), ('10'), ('11') $$,
  'raport obejmuje review oraz publikacje, odrzucenia i oceny z okna'
);

-- 5. Brak edycji; rewizja modelu jest pomijana.
select results_eq(
  $$ select editor_revisions, title_edited, lead_edited, content_edited
     from report where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001' $$,
  $$ values (0, false, false, false) $$,
  'rewizja modelu nie jest edycja redaktora'
);

-- 6
select results_eq(
  $$ select editor_revisions, title_edited, lead_edited, content_edited
     from report where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002' $$,
  $$ values (1, true, false, false) $$,
  'edycja tylko tytulu'
);

-- 7
select results_eq(
  $$ select editor_revisions, title_edited, lead_edited, content_edited
     from report where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb003' $$,
  $$ values (1, false, true, false) $$,
  'edycja tylko leadu'
);

-- 8
select results_eq(
  $$ select editor_revisions, title_edited, lead_edited, content_edited
     from report where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb004' $$,
  $$ values (1, false, false, true) $$,
  'edycja tresci'
);

-- 9. Tytul zmieniony miedzy rewizjami, tresc miedzy ostatnia rewizja a biezacym stanem.
select results_eq(
  $$ select editor_revisions, title_edited, lead_edited, content_edited
     from report where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb005' $$,
  $$ values (2, true, false, true) $$,
  'dwie edycje: tytul, potem tresc'
);

-- 10
select results_eq(
  $$ select status, rejected_at, reject_reason
     from report where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb006' $$,
  $$ values ('rejected'::article_status, '2026-01-12 10:00:00+00'::timestamptz, 'Brak potwierdzenia w drugim zrodle') $$,
  'data i powod odrzucenia z ostatniego wpisu reject'
);

-- 11
select is(
  (select published_at from report where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002'),
  '2026-01-15 12:00:00+00'::timestamptz,
  'published_at z artykulu'
);

-- 12
select is(
  (select rejected_at from report where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001'),
  null,
  'opublikowany artykul nie ma daty odrzucenia'
);

-- 13
select results_eq(
  $$ select factual_accuracy, originality, seo, clickbait, quality, unsupported_claims, checked_at
     from report where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001' $$,
  $$ values (0.95::numeric, 0.80::numeric, 0.70::numeric, 0.05::numeric, 0.90::numeric, 0,
             '2026-01-14 09:00:00+00'::timestamptz) $$,
  'oceny z article_scores'
);

-- 14
select is(
  (select unsupported_claims from report where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb009'),
  2,
  'twierdzenia bez podparcia artykulu w recenzji'
);

-- 15
select is(
  (select checked_at from report where article_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002'),
  null,
  'artykul bez oceny ma puste pola ocen'
);

-- 16. Wezsze okno: odrzucenie z 12.01 i ocena z 12.01 wypadaja, review i approved zostaja.
select results_eq(
  $$ select right(article_id::text, 2)
     from quality_report_articles('2026-01-13 00:00:00+00')
     where article_id::text like 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb0%'
     order by 1 $$,
  $$ values ('01'), ('02'), ('03'), ('04'), ('05'), ('09'), ('11') $$,
  'okno od 13.01 pomija starsze odrzucenia i oceny'
);

-- 17. Szersze okno obejmuje artykul 7 i 8.
select results_eq(
  $$ select right(article_id::text, 2), reject_reason
     from quality_report_articles('2026-01-01 00:00:00+00')
     where article_id in ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb007', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb008')
     order by 1 $$,
  $$ values ('07', null::text), ('08', null::text) $$,
  'odrzucenie bez powodu ma pusty powod'
);

-- 18
select throws_ok(
  $$ select * from quality_report_articles(null) $$,
  '22023',
  null,
  'okno bez poczatku jest bledem'
);

-- === Agregaty na kategorie ===

create temporary table totals on commit drop as
select * from quality_report_category_totals('2026-01-10 00:00:00+00');

-- 19-23. Kategoria transfery: dwa wywolania w oknie, jedno bez ceny, nieudane i eskalowane.
select is(
  (select llm_calls from totals where category_id = '33333333-3333-4333-8333-333333333331'),
  2::bigint,
  'wywolania w oknie dla kategorii'
);

select is(
  (select llm_cost_usd from totals where category_id = '33333333-3333-4333-8333-333333333331'),
  0.010000::numeric,
  'koszt pomija wywolanie sprzed okna i bez ceny'
);

select results_eq(
  $$ select llm_unpriced_calls, llm_failed_calls, llm_escalated_calls
     from totals where category_id = '33333333-3333-4333-8333-333333333331' $$,
  $$ values (1::bigint, 1::bigint, 1::bigint) $$,
  'bez ceny, nieudane i eskalowane wg settings.model_escalation'
);

select is(
  (select first_published_at from totals where category_id = '33333333-3333-4333-8333-333333333331'),
  '2026-01-01 12:00:00+00'::timestamptz,
  'pierwsza publikacja w kategorii liczona od poczatku'
);

select is(
  (select first_published_at from totals where category_id = '33333333-3333-4333-8333-333333333332'),
  '2026-01-03 12:00:00+00'::timestamptz,
  'pierwsza publikacja drugiej kategorii'
);

-- 24
select is(
  (select llm_cost_usd from totals where category_id = '33333333-3333-4333-8333-333333333332'),
  0.002000::numeric,
  'koszt drugiej kategorii'
);

-- 25-26. Wywolanie bez historii trafia do kategorii null.
select results_eq(
  $$ select llm_calls, llm_cost_usd, llm_escalated_calls, first_published_at
     from totals where category_id is null $$,
  $$ values (1::bigint, 0.005000::numeric, 1::bigint, null::timestamptz) $$,
  'wywolanie bez historii w kategorii null'
);

select is(
  (select count(*) from totals where category_id is null),
  1::bigint,
  'jeden wiersz kategorii null'
);

-- 27. Kategoria bez publikacji i bez wywolan nie ma wiersza.
select is(
  (select count(*) from totals where category_id = '33333333-3333-4333-8333-333333333333'),
  0::bigint,
  'kategoria bez publikacji i wywolan nie ma wiersza'
);

-- 28. Okno bez wywolan: zera, a pierwsza publikacja zostaje.
select results_eq(
  $$ select llm_calls, llm_cost_usd, llm_unpriced_calls, llm_failed_calls, llm_escalated_calls, first_published_at
     from quality_report_category_totals('2026-02-01 00:00:00+00')
     where category_id = '33333333-3333-4333-8333-333333333331' $$,
  $$ values (0::bigint, null::numeric, 0::bigint, 0::bigint, 0::bigint, '2026-01-01 12:00:00+00'::timestamptz) $$,
  'okno bez wywolan zwraca zera i pierwsza publikacje'
);

reset role;

-- 29. Eskalacja idzie za ustawieniem, nie za stala nazwa modelu.
update settings set value = '"gpt-5.6-luna"'::jsonb where key = 'model_escalation';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111112", "role": "authenticated"}', true);

select is(
  (select llm_escalated_calls
   from quality_report_category_totals('2026-01-10 00:00:00+00')
   where category_id = '33333333-3333-4333-8333-333333333331'),
  1::bigint,
  'eskalacja liczona wg biezacego settings.model_escalation'
);

-- 30. Redaktor dalej nie czyta llm_calls ani audit_log wprost.
select is(
  (select count(*) from llm_calls) + (select count(*) from audit_log),
  0::bigint,
  'llm_calls i audit_log zostaja niewidoczne dla redaktora'
);

reset role;

select * from finish();

rollback;
