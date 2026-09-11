#!/usr/bin/env node
import { checkTitle } from "../../../../supabase/functions/_shared/lib/title-guard.ts";

const url = process.argv[2];

if (!url) {
  console.error("Uzycie: node .cursor/skills/seo-audit/scripts/audit-article.mjs <url>");
  process.exit(1);
}

const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });

if (!response.ok) {
  console.error(`HTTP ${response.status}`);
  process.exit(1);
}

const html = await response.text();
const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
const description =
  html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"]*)["']/i)?.[1] ??
  html.match(/<meta[^>]+content=["']([^"]*)["'][^>]+name=["']description["']/i)?.[1] ??
  "";
const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"]*)["']/i)?.[1];
const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"]*)["']/i)?.[1];
const hasNewsArticle =
  html.includes('"@type":"NewsArticle"') || html.includes('"@type": "NewsArticle"');
const titleCheck = checkTitle(title.split("|")[0]?.trim() ?? title);

const issues = [];

if (!title) issues.push("brak title");
if (title.length > 70) issues.push(`title ma ${title.length} znakow (>70)`);
if (description.length < 120 || description.length > 165) {
  issues.push(`description ma ${description.length} znakow (oczekiwane 120-165)`);
}
if (!canonical) issues.push("brak canonical");
if (!ogImage) issues.push("brak og:image");
if (!hasNewsArticle) issues.push("brak JSON-LD NewsArticle");
if (!titleCheck.ok) {
  issues.push(...titleCheck.issues.map((issue) => `tytul: ${issue.message}`));
}

console.log(`URL: ${url}`);
console.log(`title: ${title}`);
console.log(`description (${description.length}): ${description}`);
console.log(`canonical: ${canonical ?? "-"}`);
console.log(`og:image: ${ogImage ?? "-"}`);
console.log(`NewsArticle: ${hasNewsArticle ? "tak" : "nie"}`);

if (issues.length > 0) {
  console.log("\nProblemy:");
  for (const issue of issues) {
    console.log(`  - ${issue}`);
  }
  process.exit(1);
}

console.log("\nAudyt SEO: OK");
