#!/usr/bin/env node
/**
 * Smoke test wdrozonej strony (docs/deployment.md): strona glowna, robots.txt, sitemapy,
 * RSS i dane strukturalne artykulu. Tylko odczyt, bez zaleznosci - fetch z Node.
 *
 *   npm run smoke:prod -- --base-url=https://<domena>
 *   npm run smoke:prod -- --base-url=https://<domena> --article=/transfery/<slug>
 *
 * Bez --article: pierwszy artykul z sitemap-news.xml, a gdy jest pusta (brak publikacji
 * z 48 h) - z sitemap.xml. Kod wyjscia: 0 - wszystko OK, 1 - co najmniej jeden blad.
 */
import { parseArgs } from "node:util";
import {
  checkArticleJsonLd,
  checkRobots,
  checkSitemap,
  extractLocs,
  findArticlePathInLocs,
  hasContentType,
  normalizeBaseUrl,
  summarize,
} from "./lib/smoke-prod.mjs";
import { fail } from "./lib/run.mjs";

const TIMEOUT_MS = 20_000;

const { values } = parseArgs({
  options: {
    "base-url": { type: "string" },
    article: { type: "string" },
  },
});

let baseUrl;
try {
  baseUrl = normalizeBaseUrl(values["base-url"]);
} catch (error) {
  fail(`${error.message} Uzycie: npm run smoke:prod -- --base-url=https://<domena>`);
}

async function get(path) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { "user-agent": "football-news-smoke/0.1" },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      body: await response.text(),
      error: null,
    };
  } catch (error) {
    return { status: 0, contentType: null, body: "", error: error.message };
  }
}

function responseErrors(response, expectedType) {
  if (response.error) {
    return [`zadanie nie powiodlo sie: ${response.error}`];
  }
  const errors = [];
  if (response.status !== 200) {
    errors.push(`HTTP ${response.status}, oczekiwane 200`);
  }
  if (!hasContentType(response.contentType, expectedType)) {
    errors.push(`Content-Type ${response.contentType ?? "brak"}, oczekiwane ${expectedType}`);
  }
  return errors;
}

const results = [];

const home = await get("/");
results.push({ name: "GET /", errors: responseErrors(home, "text/html") });

const robots = await get("/robots.txt");
const robotsErrors = responseErrors(robots, "text/plain");
results.push({
  name: "GET /robots.txt",
  errors: robotsErrors.length > 0 ? robotsErrors : checkRobots(robots.body, baseUrl),
});

const sitemap = await get("/sitemap.xml");
const sitemapErrors = responseErrors(sitemap, "application/xml");
results.push({
  name: "GET /sitemap.xml",
  errors: sitemapErrors.length > 0 ? sitemapErrors : checkSitemap(sitemap.body, baseUrl),
});

// Sitemapa news moze byc pusta, gdy w ostatnich 48 h nic nie opublikowano.
const newsSitemap = await get("/sitemap-news.xml");
let newsErrors = responseErrors(newsSitemap, "application/xml");
if (newsErrors.length === 0) {
  newsErrors = checkSitemap(newsSitemap.body, baseUrl, { requireUrls: false });
  if (!newsSitemap.body.includes("xmlns:news")) {
    newsErrors.push("brak przestrzeni nazw xmlns:news");
  }
}
results.push({ name: "GET /sitemap-news.xml", errors: newsErrors });

const feed = await get("/feed.xml");
let feedErrors = responseErrors(feed, "application/rss+xml");
if (feedErrors.length === 0 && !feed.body.includes("<rss")) {
  feedErrors = ["brak elementu <rss>"];
}
results.push({ name: "GET /feed.xml", errors: feedErrors });

const articlePath =
  values.article ??
  findArticlePathInLocs(extractLocs(newsSitemap.body), baseUrl) ??
  findArticlePathInLocs(extractLocs(sitemap.body), baseUrl);

if (!articlePath) {
  results.push({
    name: "Artykul (JSON-LD)",
    errors: ["brak artykulu w sitemapach - podaj --article=/<kategoria>/<slug>"],
  });
} else {
  const article = await get(articlePath);
  const articleErrors = responseErrors(article, "text/html");
  results.push({
    name: `GET ${articlePath} (JSON-LD NewsArticle)`,
    errors: articleErrors.length > 0 ? articleErrors : checkArticleJsonLd(article.body),
  });
}

const { text, exitCode } = summarize(results);
console.log(`Smoke ${baseUrl}\n\n${text}`);
process.exit(exitCode);
