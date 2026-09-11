# Narzędzia dla agentów

Dokument opisuje, czym w tym repozytorium wspieramy agentów AI: hooki, reguły, skille projektowe, lokalny CLI i szablony. Standardy jakości i bramki są w [docs/engineering-standards.md](engineering-standards.md), zasady pracy w [AGENTS.md](../AGENTS.md).

Trzy zasady, które porządkują ten zestaw:

1. **Wymuszenie jest silniejsze od instrukcji.** `AGENTS.md` można zignorować, hooka nie. Wszystko, co krytyczne, dostaje mechaniczne zabezpieczenie.
2. **Kontekst dowozimy wąsko.** Reguły są przypinane globem do konkretnych katalogów, zamiast wrzucać całą dokumentację do każdej sesji.
3. **Powtarzalne czynności robią skrypty, nie generowany kod.** Skrypt jest tańszy w tokenach i daje ten sam wynik za każdym razem.

---

## 1. Hooki

Lokalizacja: `.cursor/hooks.json` plus skrypty w `.cursor/hooks/`.

**Skrypty piszemy w Node** (`node .cursor/hooks/<nazwa>.mjs`), nie w bashu. Powód jest konkretny: na maszynie deweloperskiej nie ma `jq`, a `bash` to launcher WSL, więc typowy hook `bash + jq` z dokumentacji nie odpali. Node jest pewny, bo to projekt npm, i te same skrypty da się uruchomić w CI.

### 1.1 `beforeShellExecution` - bramka na komendy

`failClosed: true`. To jedyny hook, który blokuje przy własnej awarii - lepiej zatrzymać agenta niż wpuścić obejście bramki.

| Wzorzec komendy                                           | Decyzja | Powód                                      |
| --------------------------------------------------------- | ------- | ------------------------------------------ |
| `git commit` z `--no-verify` lub `-n`                     | `deny`  | Omijanie `pre-commit` jest zakazane        |
| `git push --force` / `--force-with-lease` na `main`       | `deny`  | Historia `main` jest nienaruszalna         |
| `git push` bezpośrednio na `main`                         | `deny`  | Praca wyłącznie przez pull request         |
| `supabase db push --linked`, `supabase db reset --linked` | `deny`  | Migracje na zdalną bazę tylko z CI         |
| `git reset --hard`, `git clean -fdx`, `rm -rf`            | `ask`   | Operacje nieodwracalne                     |
| `npm i` / `npm install <pakiet>`                          | `ask`   | Nowa zależność wymaga decyzji, nie odruchu |
| `psql` z `DROP`, `TRUNCATE`, `DELETE FROM` bez `WHERE`    | `ask`   | Ochrona danych lokalnych i stagingu        |

Matchery trzymamy proste (`git|supabase|npm|rm|psql`), a właściwe rozpoznanie robi skrypt - zgodnie z zaleceniem, żeby nie kombinować z wyrafinowanymi wyrażeniami regularnymi w konfiguracji.

### 1.2 `afterFileEdit` - higiena po edycji

`failClosed: false`, bo formatowanie nie może blokować pracy.

- `prettier --write` i `eslint --fix` na edytowanym pliku (tylko `.ts`, `.tsx`, `.mjs`, `.json`, `.md`).
- Jeśli edytowany plik to migracja obecna już na `main`: komunikat, że migracje są niezmienialne, i podpowiedź `supabase migration new`.
- Jeśli zmiana dotyczy `supabase/migrations/**`: przypomnienie o regeneracji `database.types.ts`.
- Jeśli zmiana dotyczy `_shared/prompts/**`: przypomnienie o podniesieniu `prompt_version`.

### 1.3 `stop` - kontrola stanu na koniec pracy

`loop_limit: 2`, żeby agent nie krążył bez końca. Hook uruchamia szybkie sprawdzenia i zwraca `followup_message`, gdy coś jest nie tak:

- `tsc --noEmit` czerwony,
- `eslint` zgłasza błędy,
- w drzewie są zmiany niescommitowane i bez wykonanego przeglądu,
- w `git diff` widać `console.log`, `@ts-ignore` albo `it.skip` bez komentarza.

To realizuje zasadę z [AGENTS.md](../AGENTS.md): agent nie kończy zadania z czerwoną bramką.

### 1.4 `beforeSubmitPrompt` - skan sekretów

Wykrywa w treści promptu wzorce kluczy (`sk-`, `service_role`, JWT, ciągi o wysokiej entropii) i ostrzega, zanim sekret trafi do historii czatu. `failClosed: false`.

---

## 2. Reguły

Lokalizacja: `.cursor/rules/*.mdc`. Każda reguła poniżej 50 linii, jedna odpowiedzialność, zero duplikowania treści `AGENTS.md` - reguła dokłada szczegóły techniczne w miejscu pracy, nie powtarza zasad ogólnych.

| Plik                    | `globs`                                 | Treść                                                                                                                                                                  |
| ----------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00-project.mdc`        | `alwaysApply: true`                     | Kilka linii: czym jest projekt, wskaźniki do `AGENTS.md` i czterech dokumentów. Nic więcej                                                                             |
| `10-migrations.mdc`     | `supabase/migrations/**`                | Nowy plik zamiast edycji, RLS obowiązkowe dla nowej tabeli, regeneracja typów, konwencje nazw i enumów                                                                 |
| `20-edge-functions.mdc` | `supabase/functions/**`                 | Walidacja zod na wyjściu LLM, idempotencja handlera (`upsert` po `story_id`), dostęp do kolejki tylko przez `jobs.ts`, zakaz `console.log`, `service_role` tylko tutaj |
| `30-prompts.mdc`        | `supabase/functions/_shared/prompts/**` | Jeden prompt jedno zadanie, obowiązkowy kontrakt wyjścia i schemat zod, bump `prompt_version`, zakaz poszerzania zakresu                                               |
| `40-next-app.mdc`       | `app/**`, `components/**`               | Server Components domyślnie, zakaz wywołań LLM, zapisy przez server actions, polskie teksty w UI, obrazy tylko z `image_assets`                                        |
| `50-content-style.mdc`  | `app/**`, `_shared/prompts/**`          | Zasady antyclickbaitowe, atrybucja źródeł, brak przesady, długość tytułu i opisu                                                                                       |
| `60-tests.mdc`          | `tests/**`, `**/*.test.ts`              | Brak wywołań zewnętrznego API, praca na fixtures, co musi być pokryte, zakaz testów-atrap pod progi pokrycia                                                           |

---

## 3. Skille projektowe

Lokalizacja: `.cursor/skills/<nazwa>/SKILL.md` plus `scripts/`. Skille współdzielone z repozytorium, wersjonowane razem z kodem.

Automatyczne wywołanie (opis z terminami wyzwalającymi) dla `add-source`, `pipeline-debug` i `seo-audit`, bo naturalnie wynikają z próśb użytkownika. Pozostałe tylko na wyraźne wywołanie, żeby nie ładowały się przypadkiem.

| Skill             | Co robi                                                                                                                                                | Skrypty                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `add-source`      | Dodanie źródła: walidacja feedu, wykrycie formatu, ustalenie `trust_score` zgodnie z rankingiem typów, wpis do seedu, zapis fixture'u, test parsowania | `validate-feed.mjs`, `add-to-seed.mjs`    |
| `new-migration`   | Nowa migracja: `supabase migration new`, szkielet tabeli z `RLS enable`, polityki, `set_updated_at`, regeneracja typów, test RLS, `db reset`           | `scaffold-migration.mjs`, `check-rls.mjs` |
| `prompt-change`   | Zmiana promptu: przebieg na zestawie fixture'ów przed i po, porównanie wyników, podniesienie wersji, raport różnic                                     | `run-prompt-eval.mjs`                     |
| `pipeline-debug`  | Diagnoza pipeline'u: martwe joby z powodami, replay pojedynczego joba, koszty i tokeny z `llm_calls`, historie zatrzymane w `blocked`                  | `dump-jobs.mjs`, `replay-job.mjs`         |
| `capture-fixture` | Zapis realnej odpowiedzi źródła do fixtures, z usunięciem nagłówków wrażliwych i normalizacją daty                                                     | `capture.mjs`                             |
| `seo-audit`       | Audyt opublikowanego artykułu: metadane, `canonical`, JSON-LD `NewsArticle`, obraz od 1200 px i 16:9, tytuł wobec listy zakazanej, długość opisu       | `audit-article.mjs`                       |

Wymagania na skille w tym repo: `SKILL.md` poniżej 500 linii, opis w trzeciej osobie z terminami wyzwalającymi, spójna terminologia zgodna z [docs/glossary.md](glossary.md), odnośniki do plików jeden poziom w głąb, ścieżki w stylu POSIX.

---

## 4. Lokalny CLI

Cel: agent nie pisze SQL z palca i nie improwizuje przy diagnozie. Skrypty w `scripts/`, wywoływane przez npm.

| Komenda                               | Działanie                                                           |
| ------------------------------------- | ------------------------------------------------------------------- |
| `npm run job:enqueue -- <TYP> [json]` | Dodaje joba do kolejki z walidacją payloadu schematem zod           |
| `npm run job:replay -- <id>`          | Zeruje `attempts` i wraca joba do `queued`                          |
| `npm run jobs:status`                 | Podsumowanie kolejki: kolejkowane, w toku, martwe, z powodami       |
| `npm run source:test -- <url>`        | Pobiera i parsuje feed bez zapisu do bazy, pokazuje rozpoznane pola |
| `npm run story:show -- <id>`          | Historia ze źródłami, faktami, oceną i artykułem                    |
| `npm run llm:cost -- [dni]`           | Koszt i tokeny per etap i per model z `llm_calls`                   |
| `npm run db:studio`                   | Supabase Studio dla lokalnej bazy                                   |
| `npm run fixtures:list`               | Dostępne fixture'y i powiązane scenariusze testowe                  |

---

## 5. Szablony repozytorium

### 5.1 `.github/pull_request_template.md`

```markdown
## Co zmienia ten PR

## Obszary ryzyka

- [ ] Dotyka RLS lub polityk dostępu
- [ ] Dotyka schematu bazy (nowa migracja)
- [ ] Dotyka promptów (podniesiona wersja)
- [ ] Dotyka pipeline'u publikacji

## Weryfikacja

- [ ] `npm run verify:all` zielone lokalnie
- [ ] Nowa logika ma testy
- [ ] Dokumentacja zaktualizowana, jeśli zmienił się kontrakt
- [ ] Przegląd kodu wykonany, uwagi `high` rozwiązane

## Czego nie sprawdziłem
```

Ostatnia sekcja jest obowiązkowa i celowo niewygodna - wymusza jawne przyznanie, co pozostało niesprawdzone.

### 5.2 `CODEOWNERS`

Wymuszony przegląd właściciela projektu dla trzech najbardziej ryzykownych ścieżek:

```
/supabase/migrations/                    @wlasciciel
/supabase/functions/_shared/prompts/     @wlasciciel
/docs/                                   @wlasciciel
/AGENTS.md                               @wlasciciel
/.cursor/                                @wlasciciel
```

### 5.3 Pozostałe

- `.nvmrc` z przypiętą wersją Node (ta sama lokalnie i w CI),
- `.editorconfig` spójny z Prettierem,
- `docs/adr/0000-template.md` jako szablon decyzji architektonicznej,
- `tests/factories/` - buildery danych testowych, żeby testy nie powtarzały setupu.

---

## 6. Czego świadomie nie dodajemy

- **Skilli-person i stylizacji wypowiedzi** (typu mowa jaskiniowa, tryb ultrazwięzły). Produktem są polskie teksty redakcyjne i audytowalne uzasadnienia decyzji; skracanie komunikacji agenta pogarsza jedno i drugie, a nie przyspiesza pracy.
- **Reguł dłuższych niż 50 linii** i reguł powtarzających `AGENTS.md`. Każda linia reguły zajmuje kontekst, który wolimy przeznaczyć na kod.
- **Serwerów MCP, z których nie korzystamy.** Jeśli dojdzie MCP Supabase, wyłącznie w trybie tylko do odczytu i tylko wobec lokalnej bazy.
- **Automatycznie generowanych README** dla każdego katalogu. Dokumentacja żyje w `docs/`, blisko decyzji, nie w rozsypce.
