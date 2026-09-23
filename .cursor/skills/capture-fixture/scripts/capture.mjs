#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const url = process.argv[2];
const name = process.argv[3] ?? "source";

if (!url) {
  console.error("Uzycie: node .cursor/skills/capture-fixture/scripts/capture.mjs <url> [nazwa]");
  process.exit(1);
}

const response = await fetch(url, {
  headers: { "user-agent": "football-news-capture-fixture/0.1" },
  signal: AbortSignal.timeout(10_000),
});

if (!response.ok) {
  console.error(`HTTP ${response.status}`);
  process.exit(1);
}

let body = await response.text();
body = body.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, "1970-01-01T00:00:00Z");

const looksJson = body.trimStart().startsWith("{") || body.trimStart().startsWith("[");
const dir = "tests/fixtures/sources";
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${name}.${looksJson ? "json" : "xml"}`);
writeFileSync(file, body, "utf8");
console.log(`Zapisano ${file} (${body.length} bajtow). Naglowki odpowiedzi pominięte.`);
