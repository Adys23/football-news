# Słownik pojęć

Jedno pojęcie, jedna nazwa. Pomieszanie tych terminów jest najczęstszym źródłem nieporozumień i błędów w tym projekcie, bo potocznie wszystko nazywa się "newsem".

---

## Łańcuch przetwarzania

**source** - źródło informacji: oficjalna strona klubu, strona ligi, dziennikarz, serwis sportowy. Wiersz w tabeli `sources`, ma `type` i `trust_score`. Nie mówimy "portal" ani "feed", gdy chodzi o źródło.

**source_item** - jedna pojedyncza informacja pobrana ze źródła: wpis z RSS, komunikat, notka. Materiał roboczy, nie treść publikowana. Pięć serwisów piszących o tym samym daje pięć `source_items`.

**story** - wydarzenie w świecie rzeczywistym. "Manchester United rozpoczął rozmowy o transferze Kowalskiego" to jedna `story`, niezależnie od tego, ile serwisów o niej napisało. `story` nie jest tekstem - nie ma treści do czytania, ma status i przypisane źródła.

**fact** - strukturalne twierdzenie w formacie podmiot-orzeczenie-dopełnienie, z `confidence` i przypisanym źródłem. Fakty są wejściem do pisania artykułu. Nie mówimy "dane" ani "informacja", gdy chodzi o `fact`.

**assessment** - ocena zestawu faktów historii: wiarygodność, konflikty między źródłami, `publishability`. Jeden wiersz na historię w `story_assessments`.

**article** - opublikowalny tekst po polsku, opisujący jedną `story`. Relacja jest wymuszona jako jeden do jednego: `articles.story_id` jest `UNIQUE`. Nowe informacje o tej samej historii to `article_update`, nigdy drugi `article`.

**article_update** - wpis w timeline istniejącego artykułu, z godziną. To nasza odpowiedź na rozwijające się wydarzenie, zamiast publikowania kolejnego bardzo podobnego tekstu.

**job** - jedna jednostka pracy w kolejce, z typem, payloadem i liczbą prób. Kolejka to tabela `jobs` w Postgresie.

---

## Nazwy, których nie używamy

| Nie mów                 | Mów                                                       | Dlaczego                                                             |
| ----------------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| "news"                  | `source_item`, `story` albo `article` - zależnie od etapu | "News" znaczy trzy różne rzeczy i zawsze prowadzi do nieporozumienia |
| "wpis", "post"          | `article`                                                 | Nie prowadzimy bloga                                                 |
| "kolejka RSS"           | `sources` plus joby `FETCH_SOURCE`                        | RSS to mechanizm pobierania, nie kolejka                             |
| "AI napisało"           | "model wygenerował draft"                                 | Draft nie jest publikacją; autorem publikacji jest redaktor          |
| "scraping"              | `ingestion`                                               | W MVP nie scrapujemy HTML, pobieramy udostępnione feedy              |
| "duplikat" (o historii) | "to samo wydarzenie"                                      | Duplikat dotyczy `source_items`, wydarzenie dotyczy `stories`        |

---

## Pojęcia jakościowe

**trust_score** - wiarygodność źródła w skali 0.00 - 1.00, wynikająca z jego typu. Oficjalny klub i liga mają 1.00, uznany dziennikarz do 0.95, agregator maksymalnie 0.50, social media maksymalnie 0.40. Pułapy są wymuszone ograniczeniem w bazie.

**confidence** - pewność pojedynczego faktu albo całej oceny, 0.00 - 1.00. To nie to samo co `trust_score`: wiarygodne źródło może podawać informację ostrożnie, a fakt potwierdzony przez dwa niezależne źródła rośnie w `confidence` bez zmiany `trust_score`.

**publishability** - `auto`, `review` albo `reject`. Wynik oceny faktów, nie oceny tekstu.

**unsupported_claims** - liczba twierdzeń w artykule, których nie ma w zatwierdzonych faktach. Wartość większa od zera blokuje publikację na poziomie triggera w bazie.

**clickbait** - wskaźnik 0.00 - 1.00 z automatycznej kontroli jakości. Dodatkowo działa deterministyczna lista zakazanych fraz, bo w tej jednej sprawie nie polegamy wyłącznie na modelu.

**importance** - waga wydarzenia 0 - 100, wpływa na priorytet w kolejce i kolejność w panelu redaktora.

---

## Role w systemie

**redaktor** (`editor`) - człowiek akceptujący, edytujący i odrzucający artykuły. Bez jego akceptacji nic nie zostaje opublikowane.

**worker** - Edge Function `process-jobs` pobierająca zadania z kolejki. Nie jest "botem" ani "agentem".

**agent** - agent AI pracujący nad kodem tego repozytorium. Nie mylić z pipeline'em AI, który przetwarza treści - to dwie zupełnie różne rzeczy i w rozmowie warto je rozróżniać wprost.

**model** - LLM wywoływany przez pipeline. Nazwy modeli są konfiguracją w `settings`, nie stałymi w kodzie.
