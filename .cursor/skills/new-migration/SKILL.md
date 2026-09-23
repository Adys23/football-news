---
name: new-migration
description: Creates a new Supabase SQL migration with RLS enabled, policies, updated_at trigger, type regeneration and a pgTAP RLS test. Use when adding a table, enum, index, or policy.
disable-model-invocation: true
---

# Nowa migracja

Migracje scalone do `main` sa niezmienialne. Poprawka to nowy plik.

## Kroki

1. `node .cursor/skills/new-migration/scripts/scaffold-migration.mjs <nazwa>`
2. Uzupelnij szkielet: tabela, `enable row level security`, polityki, trigger `set_updated_at`.
3. `node .cursor/skills/new-migration/scripts/check-rls.mjs` - zglosi tabele bez RLS.
4. `npm run db:reset`, potem `npm run db:types`.
5. Dopisz test do `supabase/tests/` jesli zmiana dotyczy RLS albo triggera publikacji.

Zasady: [docs/database.md](../../../docs/database.md), [`.cursor/rules/10-migrations.mdc`](../../rules/10-migrations.mdc).
