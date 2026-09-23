#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const name = arg("name");
const url = arg("url");
const rssUrl = arg("rss-url");
const type = arg("type");
const trust = arg("trust");
const lang = arg("lang") ?? "en";
const country = arg("country") ?? "international";
const active = arg("active") ?? "false";

if (!name || !url || !rssUrl || !type || !trust) {
  console.error(
    "Wymagane: --name --url --rss-url --type --trust. Opcjonalne: --lang --country --active",
  );
  process.exit(1);
}

const path = "supabase/seed.sql";
const sql = readFileSync(path, "utf8");
const block = `  (
    '${name.replaceAll("'", "''")}',
    '${url}',
    '${rssUrl}',
    'rss',
    '${type}',
    ${trust},
    '${lang}',
    '${country}',
    ${active}
  )`;

if (sql.includes(rssUrl)) {
  console.error("To rss_url jest juz w seed.sql.");
  process.exit(1);
}

const marker = "on conflict do nothing;";
const last = sql.lastIndexOf(marker);

if (last === -1) {
  console.error("Nie znalazlem bloku sources w seed.sql.");
  process.exit(1);
}

const before = sql.slice(0, last).trimEnd();
const updated = `${before},\n${block}\n${sql.slice(last)}`;
writeFileSync(path, updated, "utf8");
console.log(`Dopisano zrodlo "${name}" do ${path}.`);
