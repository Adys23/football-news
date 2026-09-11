# Football news

Portal z newsami piłkarskimi prowadzony jako mały newsroom oparty o AI: system pobiera informacje ze źródeł, grupuje je w wydarzenia, wyciąga strukturalne fakty, weryfikuje je, generuje polski draft i przekazuje go redaktorowi do akceptacji. Bez clickbaitu i bez publikacji bez udziału człowieka.

Stack: Next.js 16 (App Router), TypeScript, Tailwind 4, Supabase (PostgreSQL, Auth, Storage, Edge Functions, pg_cron), OpenAI.

## Dokumentacja

Zacznij tutaj, zanim dotkniesz kodu:

- [AGENTS.md](AGENTS.md) - zasady pracy w repozytorium
- [docs/glossary.md](docs/glossary.md) - słownik pojęć
- [docs/architecture.md](docs/architecture.md) - moduły, przepływ danych, SEO
- [docs/database.md](docs/database.md) - schemat bazy i RLS
- [docs/ai-pipeline.md](docs/ai-pipeline.md) - etapy AI, prompty, kontrakty
- [docs/engineering-standards.md](docs/engineering-standards.md) - bramki jakości i code review
- [docs/agent-tooling.md](docs/agent-tooling.md) - hooki, reguły, skille, CLI
- [docs/runbook.md](docs/runbook.md) - procedury awaryjne
- [docs/roadmap.md](docs/roadmap.md) - zakres MVP i kolejne etapy

## Start

Wymagania: Node 24 (`.nvmrc`), Docker Desktop, Supabase CLI.

```bash
npm install

npm run db:start     # lokalny Supabase (API 54321, baza 54322, Studio 54323)
npm run db:reset     # migracje + seed
npm run env:local    # tworzy .env.local z danych dzialajacego stacku
npm run db:types     # generacja typow z lokalnej bazy

npm run dev
```

`npm run env:local` wpisuje adres i klucze lokalnego Supabase, zachowując wartości ustawione ręcznie (np. `OPENAI_API_KEY`). Wzorzec wszystkich zmiennych jest w [.env.example](.env.example).

Konto redakcyjne z seeda: `redaktor@local.test` / `redaktor123` (tylko lokalnie).

Pipeline AI działa lokalnie bez klucza OpenAI: przy `LLM_ENABLED=false` handlery korzystają z fixtures.

## Bramki jakości

```bash
npm run verify       # typecheck + lint + format + testy + build
npm run verify:db    # db reset + db lint + testy pgTAP + zgodnosc database.types.ts
npm run verify:all   # to samo, co CI
```

Testy bazy (RLS, trigger publikacji, kolejka zadań) można uruchomić osobno: `npm run test:db`.

Commit przechodzi przez `pre-commit` (lint-staged, typecheck, lint, testy), a `pre-push` uruchamia pełną bramkę razem z bazą. Obchodzenie hooków przez `--no-verify` jest zabronione i blokowane hookiem Cursora.
