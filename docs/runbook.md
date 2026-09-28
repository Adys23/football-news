# Runbook

Procedury na sytuacje, które w newsroomie zdarzają się naprawdę. Terminologia zgodna z [docs/glossary.md](glossary.md).

Zasada nadrzędna przy każdej awarii: **najpierw zatrzymaj publikację, potem diagnozuj.** Globalny wyłącznik to `settings.pipeline_enabled = false` - zatrzymuje kolejkowanie nowych jobów, nie gubiąc tych już w kolejce.

---

## 1. Opublikowany artykuł zawiera błąd merytoryczny

Najpilniejsza sytuacja w całym systemie. Kolejność ma znaczenie.

1. Ustaw `articles.status = 'archived'`. Strona zwraca 410, artykuł wypada z sitemapy po unieważnieniu cache.
2. Sprawdź, czy webhook unieważnił cache: artykuł nie może dalej wisieć na CDN.
3. Ustal, skąd wziął się błąd: `article_scores`, `story_assessments.reasoning`, `facts` z `confidence` i `source_id`. Odpowiedz na pytanie, czy zawiniło źródło, ekstrakcja faktów, czy pisanie tekstu.
4. Jeśli zawinił model: dopisz przypadek do fixture'ów jako test regresji, żeby to samo nie przeszło drugi raz.
5. Jeśli zawiniło źródło: obniż `trust_score` albo dezaktywuj źródło.
6. Jeśli informacja była publicznie widoczna dłużej niż kilka minut, opublikuj sprostowanie jako `article_update` w przywróconym artykule, z jawną informacją o korekcie. Nie usuwamy po cichu.
7. Zapisz wniosek w `docs/adr/` albo w zasadach redakcyjnych, jeśli sprawa wymaga zmiany reguły.

---

## 2. Rosną martwe joby

Objaw: joby ze statusem `dead` w dashboardzie.

1. `npm run jobs:status` - zobacz rozkład po typie i powodzie.
2. Jeden typ joba dominuje: problem jest w handlerze albo w kontrakcie wyjścia modelu. Sprawdź `llm_calls` z `ok = false` dla tego etapu.
3. Rozkład jest równomierny: podejrzewaj awarię zewnętrzną (API modelu, limity, sieć) albo wyczerpany budżet.
4. Po naprawie: `npm run job:replay -- <id>` dla pojedynczego przypadku, a dla całej grupy `requeue_dead_jobs()` z filtrem po typie.
5. Jeśli przyczyną był nieprawidłowy JSON z modelu, dopisz przypadek do testów kontraktów przed powtórnym uruchomieniem.

Nie zwiększaj `max_attempts`, żeby "przepchnąć" joby. Trzy próby to celowy limit; problem jest po stronie przyczyny, nie liczby prób.

---

## 3. Źródło przestało odpowiadać

Objaw: `sources.consecutive_failures` rośnie, źródło zostało automatycznie wyłączone po dziesiątym błędzie.

1. `npm run source:test -- <url>` - sprawdź, czy feed w ogóle działa i czy nie zmienił struktury.
2. Zmienił się adres feedu: zaktualizuj `rss_url`, wyzeruj `consecutive_failures`, włącz źródło.
3. Zmieniła się struktura: popraw parser, dopisz fixture z nową strukturą, dodaj test.
4. Źródło blokuje ruch: zwiększ `fetch_interval_minutes`, sprawdź nagłówek `User-Agent`. Nie obchodzimy blokad.
5. Źródło zniknęło trwale: ustaw `active = false` i odnotuj to, zamiast zostawiać martwy wpis.

---

## 4. Przekroczony budżet LLM

Objaw: alert o `settings.daily_llm_budget_usd`, dispatcher przestał kolejkować joby LLM.

1. `npm run llm:cost -- 7` - zobacz koszt per etap i per model z ostatniego tygodnia.
2. Najczęstsza przyczyna to zbyt częsta eskalacja do mocniejszego modelu. Sprawdź, ile historii miało `publishability = 'review'` z powodu konfliktów - być może próg eskalacji jest za czuły.
3. Druga najczęstsza przyczyna to powtarzana ekstrakcja faktów dla historii, do której wciąż dochodzą nowe źródła. Rozważ próg: przelicz fakty tylko przy źródle o `trust_score` wyższym niż najlepsze dotychczasowe.
4. Doraźnie: podnieś budżet albo zawęź listę aktywnych źródeł. Nie wyłączaj walidacji faktów ani kontroli jakości - to najgorsze możliwe miejsce na oszczędzanie.

---

## 5. Jedno wydarzenie rozpadło się na kilka historii

Objaw: redaktor widzi w panelu dwie bardzo podobne historie.

1. Scal ręcznie: przenieś `story_sources` do historii starszej, oznacz nowszą jako `rejected`.
2. Sprawdź, dlaczego deduplikacja nie zadziałała: różne nazwy tego samego klubu lub zawodnika (brak wpisu w `aliases`), próg `similarity` za wysoki, okno czasowe za krótkie.
3. Uzupełnij `aliases` w `clubs` albo `players` - to najczęstsza przyczyna i najtańsza naprawa.
4. Dopisz przypadek do testów deduplikacji.
5. Jeśli takich sytuacji jest dużo, to argument za przyspieszeniem etapu 5 roadmapy (embeddingi), nie za obniżaniem progu podobieństwa na siłę.

Odwrotna sytuacja - dwa różne wydarzenia scalone w jedną historię - jest groźniejsza, bo prowadzi do artykułu mieszającego fakty. Rozdziel historie, obniż próg i dopisz test regresji.

---

## 6. Artykuły utknęły w `blocked`

Objaw: historie nie dochodzą do redaktora.

1. Sprawdź `article_scores` i `story_assessments` dla kilku przypadków.
2. Masowe `unsupported_claims > 0`: prompt pisania pozwala modelowi wychodzić poza fakty albo `used_fact_ids` nie jest poprawnie wypełniane. Popraw prompt, podnieś `prompt_version`, uruchom ewaluację na fixture'ach.
3. Masowo niska jakość: sprawdź, czy fakty w ogóle są sensowne. Zły wynik na końcu zwykle znaczy zbyt ubogie wejście, nie zły prompt pisania.
4. Wpisy `issues` z prefiksem `[kontrola]` pochodzą z kontroli deterministycznych (`lib/article-checks.ts`): fragment skopiowany ze źródła, tytuł niezgodny z regułami, `fact_box` spoza zatwierdzonych faktów, długość tekstu. Każdy taki wpis blokuje artykuł niezależnie od ocen modelu.
5. Artykuły w `draft` z `CHECK_ARTICLE` w `queued` i błędem „Limit … artykulow na godzine - odlozone”: działa limit `settings.max_articles_per_hour`. Job jest odłożony przez `defer_job` do chwili zwolnienia miejsca w oknie godzinowym i nie zużywa prób - nic nie trzeba robić. Nie podnoś limitu tylko po to, żeby przyspieszyć kolejkę.
6. Nie podnoś progów jakości, żeby odblokować przepływ. Progi są bezpiecznikiem, nie regulatorem przepustowości.

---

## 7. Panel redaktora nie widzi danych

1. Sprawdź rolę w `profiles` - `viewer` nie zobaczy kolejki do weryfikacji.
2. Sprawdź polityki RLS dla tabeli, która nie zwraca danych. Najczęstszy błąd to nowa tabela z włączonym RLS i bez polityki dla `authenticated`.
3. Zweryfikuj, że panel nie używa klienta anonimowego tam, gdzie potrzebna jest sesja użytkownika.

---

## 8. Publikacja nie pojawia się na stronie

1. Sprawdź, czy `articles.status = 'published'` i czy jest `published_at`.
2. Sprawdź logi webhooka i odpowiedź `/api/revalidate` - najczęstsza przyczyna to niezgodny `REVALIDATE_WEBHOOK_SECRET`.
3. Wywołaj unieważnienie ręcznie dla tagów `articles` i `article:<slug>`.
4. Jeśli strona jest, ale nie ma jej w sitemapie, sprawdź unieważnienie tagu `sitemap`.

---

## 9. Zmiana sluga po publikacji

Nie robimy tego bez potrzeby. Gdy trzeba:

1. Dopisz stary slug do `article_redirects`.
2. Zmień `slug` w `articles`.
3. Unieważnij tagi `article:<stary>`, `article:<nowy>` i `sitemap`.
4. Sprawdź, że stary adres zwraca 301 na nowy.

---

## 10. Awaria Supabase lub OpenAI

1. Ustaw `settings.pipeline_enabled = false`.
2. Strona publiczna działa dalej, bo jest statyczna i serwowana z CDN - to jedna z korzyści z ISR.
3. Joby w `queued` poczekają. Nie czyść kolejki.
4. Po przywróceniu usługi: włącz pipeline, uruchom `requeue_stale_jobs()`, sprawdź `jobs:status`.
5. Sprawdź, czy podczas awarii nie powstały artykuły z niepełnymi danymi - historie w `drafting` bez artykułu wymagają ponownego uruchomienia etapu.

---

## 11. Pipeline bez klucza OpenAI (tryb fixtures)

Kiedy: praca lokalna, CI, diagnoza handlera bez kosztów.

1. `LLM_ENABLED` inne niż `true` (także brak zmiennej) przełącza `callLlm` na `_shared/llm/fixtures/<prompt>.json`. Odpowiedź przechodzi przez ten sam schemat zod co odpowiedź modelu, a `llm_calls` dostaje wiersz z `model = 'fixture'` i kosztem 0.
2. Fixtures opisują jedną historię (kontrakt Bruno Fernandesa). Dla innej historii przejdą walidację, ale treść nie będzie do niej pasować - to narzędzie do sprawdzania przepływu, nie jakości.
3. Cały przepływ od RSS do artykułu w `review`: `npm run test:pipeline` (wymaga `supabase start`). Ostatnia linia `kontrola jakosci -> artykul w review, 7 wywolan LLM` oznacza, że każdy etap zadziałał.
4. Job kończący się bez zmian z logiem `*.stale_*` jest nieaktualny: od ekstrakcji doszło źródło albo fakty zostały przeliczone. Nowa ekstrakcja zakolejkuje własny łańcuch - nie uruchamiaj starego ręcznie.
5. Przed włączeniem prawdziwego modelu: `LLM_ENABLED=true`, `OPENAI_API_KEY` w `supabase/.env.local`, cennik modeli w `settings.model_prices` (bez niego `cost_usd = null`), `npm run llm:cost` po pierwszej historii.
