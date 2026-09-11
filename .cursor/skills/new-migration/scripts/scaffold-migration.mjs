#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const name = process.argv[2];

if (!name) {
  console.error("Uzycie: node .cursor/skills/new-migration/scripts/scaffold-migration.mjs <nazwa>");
  process.exit(1);
}

const before = new Set(readdirSync("supabase/migrations"));
const result = spawnSync("supabase", ["migration", "new", name], { encoding: "utf8" });

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const created = readdirSync("supabase/migrations").find((file) => !before.has(file));

if (!created) {
  console.log(result.stdout);
  process.exit(0);
}

const full = path.join("supabase/migrations", created);
const stub = `-- ${created}
-- Opisz zmiane jednym zdaniem.

-- create table example (
--   id uuid primary key default gen_random_uuid(),
--   created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now()
-- );
--
-- alter table example enable row level security;
--
-- create trigger example_set_updated_at
-- before update on example
-- for each row
-- execute function set_updated_at();
`;

writeFileSync(full, stub, "utf8");
console.log(`Utworzono ${full}`);
