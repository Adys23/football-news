---
name: steward
description: Project conventions for an agent that watches or drives a pull request in this repository. Use when handling PR events - red CI, a merge conflict with main, review comments, a failing required check - or when getting a PR to a green, mergeable state.
---

# Pilnowanie pull requestu

Skill dokłada konwencje tego repozytorium do ogólnych zasad pilnowania PR. Nie zastępuje ich i niczego nie luzuje: zakazy z [AGENTS.md](../../../AGENTS.md) (sekcja 4) i [docs/engineering-standards.md](../../../docs/engineering-standards.md) obowiązują bez wyjątków. W razie sprzeczności wygrywa dokumentacja.

## 1. Odtworzenie czerwonego joba lokalnie

Przed poprawką odtwórz błąd, po poprawce pokaż ten sam check na zielono. Mapowanie jobów z [.github/workflows/ci.yml](../../../.github/workflows/ci.yml):

| Job CI     | Lokalnie                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------- |
| `quality`  | `npm run typecheck && npm run lint && npm run format:check`                              |
| `deno`     | `npm run deno:check && npm run deno:lint`                                                |
| `unit`     | `npm run test:coverage` (progi pokrycia w `vitest.config.ts`)                            |
| `db`       | `npm run verify:db`, potem `LLM_ENABLED=false npm run test:pipeline` (Docker + Supabase) |
| `build`    | `npm run build` ze zmiennymi `NEXT_PUBLIC_*` jak w jobie `build` w `ci.yml`              |
| `security` | `npm audit --audit-level=high` oraz `node scripts/scan-secrets.mjs`                      |

Przed każdym pushem: `npm run verify:all`. Jeśli część bramek nie może ruszyć (brak Dockera, brak `deno`), uruchom resztę i napisz wprost, czego nie uruchomiono i dlaczego. Zmian w `supabase/**` nie pushuj bez przejścia `verify:db` lokalnie albo bez jasnej informacji, że sprawdzi je dopiero job `db`.

CI używa Supabase CLI `2.117.0`. Inna wersja lokalnie potrafi wygenerować `database.types.ts` różniący się formatem - to nie jest błąd PR.

## 2. Typowe czerwone bramki i właściwa naprawa

- **Rozjazd `database.types.ts`**: `supabase db reset`, potem `npm run db:types`. Nigdy nie edytuj pliku ręcznie i nie formatuj go Prettierem (jest w `.prettierignore`).
- **Błąd w migracji już scalonej do `main`**: nowa migracja (`supabase migration new <nazwa>`, kolejny wolny numer), nigdy edycja starej.
- **Test wersji promptu** (`tests/llm/prompts.test.ts`): zmiana pliku w `_shared/prompts/` wymaga podbicia `version` i `hash` w `_shared/prompts/versions.ts`. Sama zmiana promptu idzie w osobnym PR niż zmiana handlera.
- **Próg pokrycia**: dopisz realny test dla `_shared/lib/**` lub `_shared/contracts/**`. Progów nie obniżasz, testów-atrap nie piszesz.
- **`npm audit`**: podnieś wersję w zakresie istniejącej zależności. Nowa zależność albo podmiana pakietu to decyzja właściciela (AGENTS.md, sekcja 11).
- **`format:check`**: `npx prettier --write <pliki z PR>`, nie `npm run format` na całym repo.

Zakazane obejścia bez względu na presję czasu: `--no-verify`, `@ts-ignore`, `eslint-disable` na cały plik, `any`, `as unknown as`, `it.skip` bez powodu i zadania, obniżanie progów, usuwanie testów.

## 3. Konflikt z `main`

- Scal `main` do gałęzi PR (merge commit). Bez rebase i force push na gałęzi, której nie założyłeś.
- `package-lock.json`: weź wersję z `main`, potem `npm install` bez nazw pakietów.
- `database.types.ts`: nie rozwiązuj ręcznie - po scaleniu migracji `supabase db reset` i `npm run db:types`.
- Kolizja numeru migracji (dwie `00NN_*.sql`): zmień numer migracji z tego PR na kolejny wolny, o ile nie jest jeszcze na `main`. Migracji z `main` nie ruszasz.

## 4. Commity

- Format `typ(zakres): opis`, wymuszany przez `commitlint`. Typy: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `ci`, `db`, `prompt`. Zakresy: `ingestion`, `dedup`, `extraction`, `validation`, `generation`, `qa`, `editorial`, `delivery`, `platform`, `db`, `seo`, `admin`.
- Jedna poprawka to jeden commit. Hooki `pre-commit` i `pre-push` muszą przejść - jeśli blokują, naprawiasz przyczynę.
- Przed commitem przegląd z AGENTS.md, sekcja 10: cały `git diff --staged`, checklista z engineering-standards 2.2.
- Scalanie wyłącznie squashem, przez właściciela. Agent nie scala i nie zatwierdza PR.

## 5. Komentarze z review

Wdrażasz od razu: poprawki nazw, testy, drobne refaktory w obrębie jednej funkcji, uwagi linterów i reviewera AI, błędy wskazane w diffie.

Nie pushujesz, tylko opisujesz propozycję i czekasz na decyzję właściciela, gdy prośba dotyczy:

- kolejności etapów pipeline'u lub zasady `fakty -> walidacja -> tekst`,
- publikacji bez redaktora albo triggera publikacji,
- nowego typu źródła (innego niż RSS lub feed JSON),
- progów jakości, `trust_score`, zasad tytułów i listy zakazanych fraz,
- nowej zależności lub usługi zewnętrznej,
- polityk RLS albo którejkolwiek zasady z AGENTS.md, sekcja 4.

## 6. Opis PR

Opis trzyma sekcje z [.github/pull_request_template.md](../../../.github/pull_request_template.md). Po każdej poprawce aktualizujesz:

- **Obszary ryzyka**: zaznacz RLS, schemat bazy, prompty, pipeline publikacji, jeśli poprawka ich dotyka.
- **Weryfikacja**: tylko to, co faktycznie uruchomiono.
- **Czego nie sprawdziłem**: jawnie, na przykład "nie uruchomiłem `verify:db`, brak Dockera w środowisku".

## 7. Komunikacja

Komentarze na PR po polsku, krótko, w formie "uruchomiłem X, wynik Y" albo "nie uruchomiłem X, bo Z". Nie piszesz "działa" bez uruchomienia.
