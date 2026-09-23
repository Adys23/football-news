---
name: add-source
description: Adds an RSS or JSON feed to the newsroom sources table. Use when the user wants to add a club, league, journalist or outlet feed, validate an rss_url, set trust_score, or update seed.sql.
---

# Dodawanie zrodla

`source` to konfiguracja feedu, nie wydarzenie i nie artykul. Patrz [docs/glossary.md](../../../docs/glossary.md).

## Kroki

1. Uruchom walidacje feedu - bez zapisu do bazy:

```bash
node .cursor/skills/add-source/scripts/validate-feed.mjs <url>
```

Albo `npm run source:test -- <url>`.

2. Ustal `type` i `trust_score` wg ograniczenia w `supabase/migrations/0004_sources.sql`:

| type                                                  | trust_score |
| ----------------------------------------------------- | ----------- |
| official_club / official_league / official_federation | 1.00        |
| journalist                                            | 0.80-0.95   |
| major_outlet                                          | 0.70-0.85   |
| local_outlet                                          | 0.60-0.75   |
| aggregator                                            | <= 0.50     |
| social                                                | <= 0.40     |

Nie zgaduj adresu RSS. Jesli feed nie odpowiada, wstaw zrodlo z `active = false`.

3. Dopisz wiersz do [supabase/seed.sql](../../../supabase/seed.sql) przez:

```bash
node .cursor/skills/add-source/scripts/add-to-seed.mjs --name "..." --url "..." --rss-url "..." --type major_outlet --trust 0.85 --lang en --country international
```

4. Zapisz surowa odpowiedz do fixtures (`capture-fixture`), dodaj test parsowania w etapie 1.

5. `npm run db:reset` tylko gdy uzytkownik chce odswiezyc lokalna baze.
