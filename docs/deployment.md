# Wdrożenie produkcyjne

Procedura wdrożenia na Vercel (Next.js) i Supabase Cloud (baza, Auth, Storage, Edge Functions, pg_cron). Awarie po wdrożeniu opisuje [runbook.md](runbook.md), a schemat i migracje [database.md](database.md).

## 1. Architektura wdrożenia

| Element                                        | Gdzie                                      | Region                              |
| ---------------------------------------------- | ------------------------------------------ | ----------------------------------- |
| Next.js (strona publiczna, panel)              | Vercel, projekt podpięty pod repozytorium  | `fra1` (Frankfurt), z `vercel.json` |
| PostgreSQL, Auth, Storage                      | Supabase Cloud, osobny projekt produkcyjny | `eu-central-1` (Frankfurt)          |
| Edge Functions `fetch-sources`, `process-jobs` | ten sam projekt Supabase                   | globalnie, baza w `eu-central-1`    |
| Harmonogramy                                   | `pg_cron` + `pg_net` w bazie (0015, 0029)  | -                                   |
| Unieważnianie cache                            | trigger z 0022 -> `POST /api/revalidate`   | -                                   |

Vercel domyślnie uruchamia funkcje w `iad1` (USA). `vercel.json` przypina je do `fra1`, żeby zapytania do bazy nie przechodziły przez Atlantyk. Poza tym Next.js nie wymaga na Vercelu adaptera ani dodatkowej konfiguracji: `proxy.ts`, `revalidateTag` i route handlery z `connection()` działają natywnie.

Konta zakłada właściciel: organizacja Supabase z projektem w `eu-central-1` oraz zespół Vercel z dostępem do repozytorium GitHub.

## 2. Zmienne i sekrety

| Nazwa                                                   | Gdzie                               | Wrażliwa | Uwagi                                                                                            |
| ------------------------------------------------------- | ----------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`                              | Vercel (Production, Preview)        | nie      | `https://<ref>.supabase.co`. Wchodzi do builda, więc po zmianie potrzebny jest redeploy.         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                         | Vercel (Production, Preview)        | nie      | klucz `anon`, publiczny z definicji, chroni go RLS                                               |
| `NEXT_PUBLIC_SITE_URL`                                  | Vercel (Production; Preview osobno) | nie      | `https://<domena>` bez końcowego `/`. Z niego powstają canonicale, sitemapy, RSS i `robots.txt`. |
| `SUPABASE_SERVICE_ROLE_KEY`                             | nie ustawiamy na Vercelu            | **tak**  | aplikacja go nie używa (`lib/supabase/admin.ts` nie ma wywołań), więc Vercel go nie dostaje      |
| `REVALIDATE_WEBHOOK_SECRET`                             | Vercel (Production)                 | **tak**  | ta sama wartość w Vault jako `revalidate_webhook_secret`                                         |
| `OPENAI_API_KEY`                                        | Supabase secrets (Edge Functions)   | **tak**  | `npm run deploy:supabase -- --secrets-file=...`                                                  |
| `LLM_ENABLED`                                           | Supabase secrets (Edge Functions)   | nie      | najpierw `false`, a `true` dopiero po smoke teście                                               |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` w funkcjach | Supabase, wstrzykuje je sam         | **tak**  | nie ustawiamy ich; `secrets set` je odrzuca                                                      |
| `revalidate_webhook_url`                                | Vault                               | nie      | `https://<domena>/api/revalidate`                                                                |
| `revalidate_webhook_secret`                             | Vault                               | **tak**  | równy `REVALIDATE_WEBHOOK_SECRET`                                                                |
| `cron_functions_url`                                    | Vault                               | nie      | `https://<ref>.supabase.co/functions/v1`                                                         |
| `cron_service_role_key`                                 | Vault                               | **tak**  | klucz `service_role` projektu (patrz §4 krok 7)                                                  |
| `SUPABASE_ACCESS_TOKEN`                                 | tylko terminal osoby wdrażającej    | **tak**  | token osobisty do `deploy:supabase`, nie trafia do żadnego pliku w repo                          |
| `SUPABASE_DB_PASSWORD`                                  | tylko terminal osoby wdrażającej    | **tak**  | hasło bazy projektu, jak wyżej                                                                   |

Plik sekretów Edge Functions trzymaj poza repozytorium albo jako `supabase/.env.production` (ignorowany przez `.gitignore`, wzorzec `.env*`). Powinien zawierać wyłącznie `OPENAI_API_KEY` i `LLM_ENABLED`.

Preview na Vercelu: panel działa na sesji redaktora i RLS. Podgląd z URL-em i kluczem `anon` produkcji pozwala więc zalogowanemu redaktorowi zapisywać do bazy produkcyjnej kodem z niezrecenzowanego PR-a. Dlatego zmienne Preview wskazują na osobny projekt Supabase (staging, [architecture.md §12](architecture.md#12-środowiska)), a `NEXT_PUBLIC_SITE_URL` na adres podglądu. Dopóki stagingu nie ma, wyłącz Preview Deployments albo włącz Vercel Deployment Protection i nie loguj się w podglądach.

## 3. Skrypty

- `npm run deploy:supabase -- --project-ref=<ref>` łączy się z projektem i pokazuje migracje do wykonania. Bez `--yes` niczego nie zmienia.
- `npm run deploy:supabase -- --project-ref=<ref> --yes [--secrets-file=<plik>] [--use-api]` wykonuje po kolei `db push` (bez seeda, z `--skip-vault`), `secrets set` (tylko z plikiem, po walidacji) i `functions deploy fetch-sources process-jobs` z import mapą `supabase/functions/deno.json`. `--use-api` bundluje funkcje po stronie Supabase, bez Dockera.
- `npm run deploy:supabase -- --project-ref=<ref> --dry-run` tylko wypisuje komendy.
- `--functions-only` pomija migracje i wykonuje tylko `link`, sekrety (z `--secrets-file`) oraz `functions deploy`. Służy do wycofania funkcji (§6).
- `npm run smoke:prod -- --base-url=https://<domena> [--article=/<kategoria>/<slug>]` sprawdza stronę główną, `robots.txt`, obie sitemapy (czy adresy wskazują na tę domenę), RSS i JSON-LD `NewsArticle` artykułu (`headline`, daty ISO 8601, `dateModified >= datePublished`, `author`). Kod wyjścia `0` lub `1`.
- `npm run perf:budget -- --base-url=https://<domena>` mierzy LCP i CLS na emulowanym telefonie.

Skrypt wdrożeniowy celowo nie ustawia Vault ani crona: to SQL z sekretami, który ma przejść przez ręce osoby wdrażającej.

## 4. Pierwsze wdrożenie krok po kroku

1. **Projekt Supabase.** Utwórz projekt w `eu-central-1` i zapisz `ref`, hasło bazy oraz klucze `anon` i `service_role` (Project Settings -> API Keys). Wygeneruj token osobisty (Account -> Access Tokens).
2. **Baza i funkcje.**
   ```bash
   export SUPABASE_ACCESS_TOKEN=... SUPABASE_DB_PASSWORD=...
   npm run deploy:supabase -- --project-ref=<ref>            # podgląd: lista migracji
   printf 'LLM_ENABLED=false\nOPENAI_API_KEY=<klucz>\n' > supabase/.env.production
   npm run deploy:supabase -- --project-ref=<ref> --yes --secrets-file=supabase/.env.production
   ```
   `db push` zapyta jeszcze o potwierdzenie listy migracji.
3. **Dane startowe (SQL editor, rola `postgres`).** Seed nie idzie na produkcję, bo zawiera lokalne konta z hasłami. Wykonaj jego część od `-- === Kategorie ===` do końca: kategorie, ligi, kluby, zawodnicy i źródła. Wypisze ją `sed -n '/^-- === Kategorie ===/,$p' supabase/seed.sql`. Źródła z `active = false` włączaj dopiero po weryfikacji feedu (`npm run source:test -- <url>`). Uzupełnij cennik modeli:
   ```sql
   insert into settings (key, value, description)
   values ('model_prices', '{"<model>": {"input_per_mtok": <usd>, "output_per_mtok": <usd>}}'::jsonb,
     'Cennik modeli, USD za milion tokenow.')
   on conflict (key) do update set value = excluded.value;
   ```
   Bez cennika `llm_calls.cost_usd = null`, więc dzienny limit `daily_llm_budget_usd` nie widzi wydatków.
4. **Pierwszy administrator.** Postępuj według [runbook.md §14](runbook.md#14-nowe-konto-redaktora): Authentication -> Add user w dashboardzie, potem `insert into profiles (...)` z rolą `admin`.
5. **Vercel.** Zaimportuj repozytorium (framework wykryje się sam), ustaw zmienne z §2 dla Production, dodaj domenę i rekordy DNS według instrukcji Vercela. Pierwszy deploy produkcyjny zrób po ustawieniu zmiennych, bo `NEXT_PUBLIC_*` wchodzą do builda.
6. **Webhook publikacji (Vault).** Ustaw sekrety według [runbook.md §8](runbook.md#8-publikacja-nie-pojawia-się-na-stronie), krok 3. `revalidate_webhook_secret` musi być równy `REVALIDATE_WEBHOOK_SECRET` na Vercelu.
7. **Cron (Vault i aktywacja).** Ustaw sekrety i włącz harmonogramy według [runbook.md §15](runbook.md#15-harmonogramy-cron-na-produkcji). Klucz w `cron_service_role_key` musi być tym samym kluczem, który funkcje dostają jako `SUPABASE_SERVICE_ROLE_KEY`, bo `assertServiceRole` porównuje go dosłownie. W projekcie z nowymi kluczami API (`sb_secret_...`) użyj klucza `service_role` z zakładki Legacy API Keys.
8. **Auth.** Authentication -> URL Configuration: `Site URL` = `https://<domena>`, Redirect URLs = `https://<domena>/**`. Nie używaj `supabase config push`, bo `config.toml` jest lokalny i nadpisałby produkcję adresami `localhost`.
9. **Smoke.** `npm run smoke:prod -- --base-url=https://<domena>`. Przed pierwszą publikacją kontrola artykułu zgłosi brak artykułu w sitemapach. To oczekiwane, powtórz ją po publikacji.
10. **Pipeline z fixtures, potem z modelem.** Przy `LLM_ENABLED=false` sprawdź, że `process-jobs` odpowiada `200` w `net._http_response` i że materiały z RSS trafiają do kolejki. Potem ustaw `LLM_ENABLED=true` (`npx supabase secrets set LLM_ENABLED=true --project-ref <ref>`), przepuść jedną historię i sprawdź koszt (`llm_calls`).

## 5. Kolejne wdrożenia

- Kod Next.js wdraża Vercel przy merge'u do `main` (integracja z GitHubem), a podglądy powstają dla PR-ów.
- Migracje i funkcje wdraża ręcznie `npm run deploy:supabase` z aktualnego `main`, **przed** merge'em zmian w Next.js, które od nich zależą. Migracje muszą być wstecznie zgodne z działającą wersją strony: najpierw dodajemy, a usuwamy dopiero w kolejnym wydaniu.
- Numery migracji rosną monotonicznie. Jeśli migracja o niższym numerze trafi na `main` po wdrożeniu wyższej, `db push` jej nie przyjmie. Wymaga to świadomego `supabase db push --include-all` po sprawdzeniu, że kolejność nie ma znaczenia.
- Zmiana `NEXT_PUBLIC_*` wymaga redeployu na Vercelu. Zmiana sekretu funkcji (`secrets set`) działa od następnego wywołania.

## 6. Wycofanie zmian

- **Next.js:** Vercel -> Deployments -> poprzedni deployment -> Instant Rollback (albo Promote to Production).
- **Baza:** migracje są niezmienialne, więc wycofanie to nowa migracja naprawcza. Na czas jej przygotowania zatrzymaj pipeline: `update settings set value = 'false' where key = 'pipeline_enabled';` i wyłącz harmonogramy (`cron.alter_job(jobid, active := false)`, [runbook.md §15](runbook.md#15-harmonogramy-cron-na-produkcji)).
- **Edge Functions:** `git checkout <poprzedni commit>` i `npm run deploy:supabase -- --project-ref=<ref> --functions-only --yes`. Tryb `--functions-only` pomija `db push`: po powrocie do starszego commita lokalny katalog migracji nie ma migracji już wykonanych na produkcji, więc `db push` by się zatrzymał.

## 7. Kryteria gotowości etapu 4

- [ ] Publikacja jest widoczna na stronie w mniej niż minutę. Sprawdź `created` i `status_code` w `net._http_response` oraz `curl -sI https://<domena>/<kategoria>/<slug>` zaraz po publikacji.
- [ ] Rich Results Test i Schema Markup Validator nie zgłaszają błędów `NewsArticle` ani `BreadcrumbList`.
- [ ] `dateModified` w JSON-LD rośnie po wpisie w `article_updates` (`smoke:prod --article=...` przed i po).
- [ ] `npm run perf:budget -- --base-url=https://<domena>`: LCP < 2,0 s, CLS < 0,1.
- [ ] `npm run smoke:prod -- --base-url=https://<domena>` kończy się kodem `0`.
- [ ] `cron.job_run_details` pokazuje udane przebiegi `fetch-sources` i `process-jobs`, a `net._http_response` ma status `200`.

## 8. Poza zakresem (propozycje)

- Automatyczne wdrożenie bazy i funkcji z GitHub Actions (`db push` + `functions deploy` po merge'u do `main`). To nowa integracja z tokenem produkcyjnym w sekretach repozytorium, więc wymaga decyzji właściciela.
- Vercel Speed Insights jako pomiar LCP i CLS u prawdziwych użytkowników. To nowa zależność (`@vercel/speed-insights`), więc również decyzja właściciela.
