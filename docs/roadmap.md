# Roadmapa

Zasada: nie budujemy od razu całego portalu. Najpierw fundament danych i pipeline, potem redakcja, potem inteligencja (embeddingi, baza transferowa), a dopiero na końcu automatyzacja publikacji.

Kolejność jest celowa - pierwszym krokiem nie jest frontend, tylko schemat `sources -> source_items -> stories -> facts -> articles -> players/clubs` oraz kolejka `jobs`. To fundament całego portalu i najdroższa rzecz do zmiany później.

---

## Etap 0: Fundament repozytorium

Cel: działające środowisko lokalne i kompletny schemat bazy, bez żadnej logiki AI.

Zakres:

- inicjalizacja repozytorium, Next.js 16 z App Routerem, TypeScript, Tailwind 4, shadcn/ui,
- `supabase init`, konfiguracja lokalnego stacku w Dockerze,
- migracje `0001` - `0015` zgodnie z [docs/database.md](database.md),
- `seed.sql` z 8 - 10 źródłami RSS, kategoriami i kilkoma klubami,
- kontrakty zod i wygenerowane typy bazy w `supabase/functions/_shared/contracts/`,
- szkielet kolejki: `enqueue_job`, `claim_jobs`, `complete_job`, `fail_job`,
- `.env.example`, ESLint, Prettier w trybie `strict`, vitest,
- bramki jakości zgodnie z [docs/engineering-standards.md](engineering-standards.md): skrypty `verify`, `verify:db`, `verify:all`, hooki `husky` (`pre-commit`, `commit-msg`, `pre-push`), `lint-staged`, `commitlint`,
- repozytorium zdalne, branch protection na `main` (brak bezpośrednich pushy, wymagane checki, wymagany review),
- narzędzia dla agentów zgodnie z [docs/agent-tooling.md](agent-tooling.md): hooki w Node, reguły `.cursor/rules/*.mdc`, skille projektowe, lokalny CLI, szablon PR i `CODEOWNERS`,
- `ci.yml` z jobami `quality`, `unit`, `build`, `security` od pierwszego commitu z kodem; job `db` po pierwszych migracjach.

Definicja ukończenia: `supabase db reset` przechodzi bez błędów, typy generują się z lokalnej bazy, `npm run dev` uruchamia stronę i pusty panel, `npm run verify:all` przechodzi lokalnie, a próba commitu z błędem typów jest blokowana przez hooka.

---

## Etap 1: Ingestion i deduplikacja

Cel: newsy same wpadają do bazy i grupują się w wydarzenia. Nadal bez LLM.

Zakres:

- Edge Function `fetch-sources`: parsowanie RSS, `If-None-Match`, timeouty, circuit breaker,
- zapis `source_items` z hashem i znormalizowanym tytułem,
- Edge Function `process-jobs` z workerem kolejki i mapą handlerów,
- handler `PROCESS_STORY`: deduplikacja hash -> trigram -> encje, tworzenie `stories` i `story_sources`,
- rozpoznawanie zawodników i klubów po `aliases`,
- harmonogramy `pg_cron`: `fetch-sources` co 5 minut, `process-jobs` co minutę,
- widok `/admin/historie` z listą wykrytych wydarzeń i przypisanymi źródłami,
- job CI `pipeline-smoke`: fixture'y RSS przechodzą przez `FETCH_SOURCE` i `PROCESS_STORY`, asercja "pięć materiałów to jedna historia".

Definicja ukończenia: po godzinie działania w bazie są historie z wieloma źródłami, a ten sam news z pięciu serwisów tworzy jedno wydarzenie, nie pięć - i jest to zabezpieczone testem w CI, nie tylko sprawdzone ręcznie.

---

## Etap 2: Pipeline AI do draftu

Cel: z wydarzenia powstaje polski draft oparty na zatwierdzonych faktach.

Zakres:

- klient LLM z retry, walidacją zod, logowaniem do `llm_calls` i przełącznikiem `LLM_ENABLED`,
- prompty `01` - `06` jako wersjonowane pliki `.md`,
- handlery `EXTRACT_FACTS`, `VALIDATE_FACTS`, `GENERATE_ARTICLE`, `GENERATE_TITLE`, `GENERATE_SEO`, `CHECK_ARTICLE`,
- routing modeli z eskalacją i budżet dzienny w `settings`,
- deterministyczne walidacje: lista zakazanych słów w tytule, kontrola `used_fact_ids`, detekcja skopiowanych zdań,
- fixtures do pracy bez kosztów.

Definicja ukończenia: historia z 3 źródeł przechodzi cały pipeline do `articles.status = 'review'`, tekst nie zawiera faktu, którego nie ma w `facts`, a koszt artykułu jest widoczny w `llm_calls`.

---

## Etap 3: Panel redaktora

Cel: redaktor może realnie pracować, a jego decyzje są mierzone.

Zakres:

- logowanie przez Supabase Auth, role `admin` / `editor` / `viewer`, middleware na `/admin`,
- dashboard: nowe informacje, do weryfikacji, gotowe do publikacji, opublikowane dzisiaj, sekcja pilnych,
- widok recenzji: tytuł, lead, treść, lista źródeł z linkami, tabela faktów z `confidence`, scoring AI, konflikty,
- edytor bloków z walidacją schematu,
- akcje Odrzuć / Edytuj / Publikuj z zapisem do `audit_log` i `article_revisions`,
- widok martwych jobów i zdrowia źródeł.

Definicja ukończenia: redaktor przechodzi od zgłoszenia do publikacji bez dotykania bazy, a każda jego akcja jest w `audit_log`.

---

## Etap 4: Publikacja i SEO

Cel: artykuły są dostępne, szybkie i poprawnie opisane dla Google oraz Discover.

Zakres:

- publiczne trasy: strona główna, kategorie, artykuł, profile zawodników i klubów, strony autorów,
- `BlockRenderer`, lista źródeł pod artykułem, informacja o roli AI i akceptacji redaktora,
- metadane, `canonical`, Open Graph, `max-image-preview:large`,
- JSON-LD `NewsArticle` i `BreadcrumbList`,
- `sitemap.xml`, `sitemap-news.xml` (48 godzin), `robots.txt`, feed RSS,
- publikacja przez webhook Supabase -> `/api/revalidate` -> `revalidateTag`,
- `article_redirects` i obsługa 301 przy zmianie sluga,
- strona zasad redakcyjnych i informacje o wydawcy,
- budżety wydajności: LCP poniżej 2,0 s na mobile, CLS poniżej 0,1.

Definicja ukończenia: opublikowany artykuł jest widoczny na produkcji w czasie krótszym niż minuta, przechodzi test danych strukturalnych i ma poprawne `dateModified`.

To zamyka MVP.

---

## MVP: podsumowanie zakresu

Stack: Next.js, TypeScript, Tailwind, shadcn/ui, Supabase (PostgreSQL, Auth, Storage, Edge Functions, Cron), OpenAI z GPT-5.6 Luna jako modelem domyślnym.

Źródła: 5 - 10 na start, nie 100.

Funkcje MVP:

- pobieranie RSS,
- deduplikacja,
- ekstrakcja faktów,
- generowanie draftu,
- automatyczny fact check,
- panel redaktora,
- publikacja,
- SEO, sitemap, schema `NewsArticle`,
- autorzy, kategorie, zawodnicy, kluby.

Świadomie **poza MVP**: embeddingi, automatyczne łączenie historii, baza transferowa z UI, automatyczne aktualizacje artykułów, social media, newsletter, automatyczna selekcja zdjęć, publikacja bez redaktora, scrapowanie HTML.

---

## Etap 5: V2 - inteligencja systemu

- embeddingi w `pgvector` i wyszukiwanie hybrydowe zamiast trigramów,
- automatyczne łączenie i rozdzielanie historii z kontrolą redaktora,
- `UPDATE_ARTICLE`: timeline aktualizacji w istniejącym artykule zamiast nowego tekstu,
- baza transferowa z publicznym UI (`transfers`),
- pełne profile zawodników i klubów z automatycznym linkowaniem wewnętrznym,
- biblioteka zdjęć z licencjami i przypisywaniem obrazu do artykułu,
- wyszukiwarka na stronie,
- raport kosztów i jakości w panelu.

---

## Etap 6: V3 - skala i dystrybucja

- kolejne dyscypliny (schemat jest już na to przygotowany polem `sport`),
- źródła API i wybrane social media z osobnym, niskim `trust_score`,
- newsletter i automatyczna dystrybucja w social media,
- partycjonowanie `source_items`, retencja i optymalizacja kosztów bazy,
- warunkowa automatyzacja publikacji dla wybranych kategorii, wyłącznie na podstawie zebranych danych o jakości.

---

## Kryteria włączenia automatycznej publikacji

Nie jest to decyzja techniczna, tylko decyzja oparta na danych z co najmniej 2 - 3 miesięcy pracy newsroomu. Warunki minimalne:

- co najmniej 60 dni pracy z redaktorem w pętli,
- ponad 95 procent artykułów zaakceptowanych bez poprawek merytorycznych w danej kategorii,
- zero wykrytych halucynacji w ostatnich 30 dniach w tej kategorii,
- stabilne wyniki `article_scores` i brak skarg dotyczących rzetelności,
- włączenie tylko dla wąskich, dobrze zdefiniowanych typów wydarzeń (na przykład oficjalne komunikaty klubów), nigdy dla plotek transferowych.

Google nie zakazuje AI, ale ostrzega przed masowym tworzeniem stron bez wartości dodanej. Automatyzacja publikacji jest więc nagrodą za udowodnioną jakość, a nie punktem startowym.
