#!/usr/bin/env node
import { fail } from "./lib/run.mjs";

const url = process.argv[2];

if (!url) {
  fail("Uzycie: npm run source:test -- <url>");
}

const response = await fetch(url, {
  headers: { "user-agent": "football-news-source-test/0.1" },
  signal: AbortSignal.timeout(10_000),
});

if (!response.ok) {
  fail(`HTTP ${response.status} ${response.statusText}`);
}

const body = await response.text();
const isRss = /<rss[\s>]|<feed[\s>]/i.test(body);
const isJson = body.trimStart().startsWith("{") || body.trimStart().startsWith("[");

const titles = [...body.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gis)].map(
  (match) => match[1].replace(/\s+/g, " ").trim(),
);

console.log(`URL: ${url}`);
console.log(`Status: ${response.status}`);
console.log(`Content-Type: ${response.headers.get("content-type") ?? "?"}`);
console.log(`Format: ${isRss ? "rss/atom" : isJson ? "json" : "nieznany"}`);
console.log(`Rozmiar: ${body.length} bajtow`);

if (titles.length > 0) {
  console.log(`Tytuly (${Math.min(titles.length, 8)} z ${titles.length}):`);
  for (const title of titles.slice(0, 8)) {
    console.log(`  - ${title}`);
  }
}
