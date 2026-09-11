#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const dir = "supabase/migrations";
const files = readdirSync(dir).filter((file) => file.endsWith(".sql"));
const missing = [];

for (const file of files) {
  const sql = readFileSync(path.join(dir, file), "utf8");
  const tables = [...sql.matchAll(/create table (\w+)/gi)].map((match) => match[1]);

  for (const table of tables) {
    const enabled = new RegExp(`alter table ${table} enable row level security`, "i").test(sql);
    if (!enabled) {
      missing.push(`${file}: ${table}`);
    }
  }
}

if (missing.length > 0) {
  console.error("Tabele bez RLS w tej samej migracji:");
  for (const row of missing) {
    console.error(`  ${row}`);
  }
  process.exit(1);
}

console.log(`OK: ${files.length} migracji, wszystkie nowe tabele wlacza RLS.`);
