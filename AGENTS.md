# AGENTS.md

Instrukcje dla agentów AI i osób pracujących w tym repozytorium. Przeczytaj ten plik przed pierwszą zmianą.

Projekt: portal z newsami piłkarskimi prowadzony jako mały newsroom oparty o AI. Treści po polsku, kod i identyfikatory po angielsku.

Dokumentacja źródłowa - w razie sprzeczności wygrywa dokumentacja, nie implementacja:

- [docs/engineering-standards.md](docs/engineering-standards.md) - bramki jakości, hooki, CI, zasady code review
- [docs/glossary.md](docs/glossary.md) - słownik pojęć; przeczytaj, zanim nazwiesz cokolwiek "newsem"
- [docs/architecture.md](docs/architecture.md) - moduły, struktura katalogów, przepływ danych, SEO
- [docs/database.md](docs/database.md) - schemat bazy, RLS, kolejność migracji
- [docs/ai-pipeline.md](docs/ai-pipeline.md) - etapy AI, prompty, kontrakty JSON, routing modeli
- [docs/agent-tooling.md](docs/agent-tooling.md) - hooki, reguły, skille projektowe, lokalny CLI
- [docs/runbook.md](docs/runbook.md) - procedury awaryjne; zajrzyj tu, zanim zaczniesz diagnozować na czuja
- [docs/roadmap.md](docs/roadmap.md) - co jest w MVP, a co świadomie poza nim

---

## 1. Stack

- Next.js 16 (App Router), TypeScript w trybie `strict`
- Tailwind CSS 4, shadcn/ui
- Supabase: PostgreSQL, Auth, Storage, Edge Functions (Deno), pg_cron, pg_net
- OpenAI API - GPT-5.6 Luna domyślnie, GPT-5.6 Sol przy eskalacji
- zod do walidacji, vitest do testów

Nie dodawaj nowych zależności bez wyraźnej potrzeby. Nie wprowadzaj ORM-a (Prisma, Drizzle) - korzystamy z `supabase-js` i typów generowanych z bazy. Nie dodawaj osobnej infrastruktury kolejkowej - kolejka to tabela `jobs`.

---

## 2. Komendy

```bash
npm run dev                # Next.js
npm run build              # build produkcyjny
npm run lint               # ESLint, --max-warnings=0
npm run typecheck          # tsc --noEmit
npm test                   # vitest
npm run verify             # typecheck + lint + format + test + build
npm run verify:db          # db reset + db lint + zgodność database.types.ts
npm run test:pipeline      # smoke całego pipeline'u na fixtures
npm run verify:all         # to samo, co robi CI

supabase start             # lokalny stack (Docker)
supabase db reset          # ponowne odtworzenie bazy z migracji + seed
supabase migration new <nazwa>
supabase gen types typescript --local > supabase/functions/_shared/contracts/database.types.ts
supabase functions serve process-jobs --env-file supabase/.env.local
```

Po każdej zmianie schematu: nowa migracja, `supabase db reset`, regeneracja typów. W tej kolejności.

---

## 3. Gdzie co należy

| Zadanie                                                   | Miejsce                                   |
| --------------------------------------------------------- | ----------------------------------------- |
| Pobieranie źródeł, deduplikacja, LLM, scoring, publikacja | `supabase/functions/`                     |
| Schematy zod i typy bazy                                  | `supabase/functions/_shared/contracts/`   |
| Prompty                                                   | `supabase/functions/_shared/prompts/*.md` |
| Dostęp do kolejki                                         | `supabase/functions/_shared/lib/jobs.ts`  |
| Strona publiczna i panel                                  | `app/`                                    |
| Komponenty prezentacyjne                                  | `components/`                             |
| Klienci Supabase, SEO, formatowanie                       | `lib/`                                    |
| Migracje SQL                                              | `supabase/migrations/`                    |
| Testy jednostkowe                                         | `tests/`                                  |

Kontrakty są współdzielone: Deno rozwiązuje importy przez import map w `supabase/functions/deno.json`, Next.js przez alias w `tsconfig.json`. Nie duplikuj schematów po stronie aplikacji.

---

## 4. Zasady, których nie wolno naruszyć

Te reguły wynikają z decyzji architektonicznych i z ryzyka prawnego oraz SEO. Nie zmieniaj ich bez zmiany dokumentacji i wyraźnej zgody.

1. **Nigdy nie wywołuj LLM z kodu Next.js.** Wszystkie wywołania modelu żyją w Edge Functions, za `_shared/llm/call.ts`.
2. **Nigdy nie generuj artykułu bez zatwierdzonych faktów.** Kolejność `fakty -> walidacja -> tekst` jest nienaruszalna. Model do pisania nie dostaje surowych tekstów źródeł.
3. **Nigdy nie publikuj bez akceptacji redaktora.** `articles.status = 'published'` wymaga `approved_by`. Trigger w bazie to wymusza; nie obchodź go.
4. **Zawsze waliduj wyjście LLM schematem zod** przed zapisem do bazy. Brak walidacji to błąd blokujący.
5. **Klucz `service_role` i `OPENAI_API_KEY` tylko w Edge Functions.** Nigdy w kodzie klienckim, nigdy w zmiennych `NEXT_PUBLIC_*`.
6. **RLS zostaje włączone na każdej nowej tabeli.** Nowa tabela bez polityk to błąd blokujący.
7. **Jedna historia, jeden artykuł.** Nowe informacje to aktualizacja (`article_updates`), nie drugi tekst o tym samym.
8. **Zero clickbaitu.** Bez wykrzykników, bez ukrywania kluczowej informacji, bez przesady, bez pytań retorycznych w tytułach. Lista zakazanych fraz jest sprawdzana deterministycznie, nie tylko przez model.
9. **Nie generuj zdjęć zawodników przez AI.** Obrazy wyłącznie z `image_assets` z wypełnioną licencją.
10. **Nie kopiuj treści źródeł.** Cytat jest dozwolony jako krótki fragment z atrybucją, w bloku `quote`.
11. **Migracje są niezmienialne po scaleniu.** Poprawka to nowa migracja, nigdy edycja starej.
12. **Bez scrapowania HTML w MVP.** Tylko RSS i feedy JSON udostępniane przez źródło.
13. **Zakaz commitowania przy czerwonym `typecheck`, `lint` lub `test`.** Nie ma commitów "naprawię w następnym".
14. **Zakaz `git commit --no-verify` i omijania hooków.** Jeśli hook blokuje, naprawiasz przyczynę, nie hook.
15. **Zakaz pushowania na `main`.** Zawsze gałąź i pull request.
16. **Zakaz wyłączania reguł zamiast naprawy.** `@ts-ignore` zabroniony, `@ts-expect-error` tylko punktowo z uzasadnieniem, `eslint-disable` dla całego pliku zabroniony, `it.skip` wymaga powodu i odnośnika do zadania.
17. **Zakaz commitowania bez przeglądu kodu** według procedury z sekcji 10.
18. **Zakaz raportowania "działa" bez uruchomienia.** Piszesz, co uruchomiłeś i z jakim wynikiem, albo czego nie uruchomiłeś i dlaczego.

---

## 5. Konwencje kodu

- TypeScript `strict`, bez `any`; typy bazy z `database.types.ts`.
- Nazwy plików komponentów w `PascalCase`, pozostałe w `kebab-case`.
- Server Components domyślnie; `"use client"` tylko gdy potrzebna interaktywność.
- Zapisy z panelu przez server actions, nie przez route handlery.
- Zapytania do bazy w kodzie serwerowym; nie odpytuj bazy z komponentów klienckich.
- W SQL: jawne nazwy kolumn, brak `select *` w kodzie aplikacji.
- Handlery jobów: jeden plik na typ, sygnatura `(job, ctx) => Promise<void>`, idempotentne (`upsert` po `story_id` lub `article_id`).
- Błędy: handler rzuca wyjątek, worker woła `fail_job` z backoffem. Nie łykaj błędów po cichu.
- Komentarze tylko tam, gdzie kod nie może wyrazić ograniczenia. Nie opisuj w komentarzu tego, co robi następna linia.
- Teksty widoczne dla użytkownika po polsku, nazwy zmiennych i tabel po angielsku.

---

## 6. Praca z promptami

- Prompt to plik `.md` w `_shared/prompts/`, nie string w kodzie.
- Zmiana promptu wymaga podniesienia jego wersji; `articles.prompt_version` zapisuje hash użytej wersji.
- Każdy prompt ma opisany kontrakt wyjścia i odpowiadający mu schemat zod.
- Nie rozszerzaj zakresu promptu "na wszelki wypadek" - jeden prompt, jedno zadanie.
- Przed zmianą promptu uruchom pipeline na fixtures i porównaj wynik.

---

## 7. Praca bez kosztów i testy

- `LLM_ENABLED=false` przełącza klienta LLM na fixtures z `_shared/llm/fixtures/`. Cały przepływ - od RSS do artykułu w `review` - działa lokalnie bez klucza OpenAI.
- Testy w CI nigdy nie wołają zewnętrznego API.
- Obowiązkowo pokryte testami: parsowanie RSS na zapisanych plikach, normalizacja tytułu i hash, progi `trust_score`, backoff w `fail_job`, walidacja bloków artykułu, lista zakazanych fraz w tytule.

---

## 8. Zmienne środowiskowe

Wszystkie nowe zmienne dopisz do `.env.example` z placeholderem i krótkim opisem. Nigdy nie commituj prawdziwych wartości.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
SUPABASE_SERVICE_ROLE_KEY=      # tylko serwer / Edge Functions
OPENAI_API_KEY=                 # tylko Edge Functions
REVALIDATE_WEBHOOK_SECRET=
LLM_ENABLED=false
```

---

## 9. Commity i pull requesty

- Commity w formacie `typ(zakres): opis`, na przykład `feat(ingestion): parser RSS z obsluga etag`. Wymuszane przez `commitlint`.
- Jeden commit to jedna logiczna zmiana. Jeden PR to jeden temat. Miękki limit 400 zmienionych linii bez plików generowanych.
- Migracja schematu idzie w osobnym PR niż zmiana UI. Zmiana promptu w osobnym PR niż zmiana handlera. Refaktor nie jest łączony ze zmianą zachowania.
- Przed pushem: `npm run verify:all`. Przed PR: bramki CI muszą być zielone.
- W opisie PR zaznacz, czy zmiana dotyka RLS, promptów albo schematu bazy - te trzy obszary wymagają uważnej recenzji.
- Scalanie tylko squashem, tylko z zielonymi wymaganymi checkami i zaakceptowanym review. `main` jest zablokowany na bezpośrednie pushe.

---

## 10. Przegląd kodu przed commitem

Obowiązkowe, za każdym razem. Szczegóły i pełna checklista w [docs/engineering-standards.md](docs/engineering-standards.md).

1. Przeczytaj cały `git diff --staged` linia po linii.
2. Uruchom automatycznego recenzenta (`Bugbot`) na niescommitowanych zmianach. Uwagi `high` blokują commit, `medium` wymagają decyzji opisanej w commicie.
3. Sprawdź krótką listę: walidacja zod na wyjściu LLM, idempotencja handlera, RLS na nowej tabeli, brak sekretów i `NEXT_PUBLIC_*` z wrażliwą nazwą, brak `console.log` i martwego kodu, właściwa warstwa (LLM tylko w Edge Functions), `prompt_version` podniesiony przy zmianie promptu.
4. Commituj - `pre-commit` uruchomi `lint-staged`, `typecheck`, `lint`, `test` oraz `verify:db`, gdy w commicie są zmiany w `supabase/**`.

Jeśli którakolwiek bramka jest czerwona, zadanie nie jest skończone. Nie obchodzi się hooka, nie zmienia się progów, nie usuwa się testu.

---

## 11. Gdy coś jest niejasne

Zapytaj, zanim zaczniesz pisać kod, jeśli zadanie wymaga:

- zmiany kolejności etapów pipeline'u,
- publikacji bez udziału redaktora,
- dodania źródła innego typu niż RSS lub feed JSON,
- zmiany progów jakości albo zasad dotyczących tytułów,
- nowej zależności lub nowej usługi zewnętrznej.

To są decyzje projektowe, nie implementacyjne.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
