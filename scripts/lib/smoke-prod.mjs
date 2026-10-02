/**
 * Czysta logika `scripts/smoke-prod.mjs`: parsowanie odpowiedzi i ocena wynikow.
 * Bez sieci i bez zaleznosci, zeby dalo sie ja testowac na zapisanych stringach.
 */

/** Adres bazowy bez koncowego `/`, tylko http(s). */
export function normalizeBaseUrl(value) {
  if (!value) {
    throw new Error("Brak --base-url.");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Niepoprawny --base-url: ${value}`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`--base-url musi byc adresem http(s): ${value}`);
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** Wszystkie wartosci `<loc>` z sitemapy, po zdekodowaniu encji XML. */
export function extractLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((match) => decodeXml(match[1]));
}

function decodeXml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

/** Czy adres wskazuje na ten sam host co baza (wykrywa zly NEXT_PUBLIC_SITE_URL). */
export function isSameOrigin(url, baseUrl) {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Sciezka artykulu z listy adresow sitemapy: dwa segmenty `/<kategoria>/<slug>`.
 * Dwa segmenty maja tez profile i strony redakcyjne - ich pierwsze segmenty to statyczne
 * sciezki z RESERVED_PATH_SEGMENTS w lib/public/paths.ts, ktorego .mjs nie zaimportuje.
 */
const NON_ARTICLE_SECTIONS = ["zawodnicy", "kluby", "autorzy", "o-nas"];

export function findArticlePathInLocs(locs, baseUrl) {
  for (const loc of locs) {
    if (!isSameOrigin(loc, baseUrl)) {
      continue;
    }

    const { pathname } = new URL(loc);
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 2 && !NON_ARTICLE_SECTIONS.includes(segments[0] ?? "")) {
      return pathname;
    }
  }

  return null;
}

/** Tresc wszystkich blokow `<script type="application/ld+json">` z HTML. */
export function extractJsonLdBlocks(html) {
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  return [...html.matchAll(pattern)].map((match) => match[1]);
}

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Sprawdza dane strukturalne artykulu: blok NewsArticle (albo Article) z tytulem,
 * datami w ISO 8601 (dateModified nie wczesniej niz datePublished) i autorem.
 * Zwraca liste bledow; pusta lista oznacza poprawny JSON-LD.
 */
export function checkArticleJsonLd(html) {
  const blocks = extractJsonLdBlocks(html);
  if (blocks.length === 0) {
    return ["brak <script type=application/ld+json>"];
  }

  const errors = [];
  const nodes = [];

  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block);
      nodes.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      errors.push("JSON-LD nie jest poprawnym JSON-em");
    }
  }

  const article = nodes.find(
    (node) => node && (node["@type"] === "NewsArticle" || node["@type"] === "Article"),
  );
  if (!article) {
    return [...errors, "brak bloku @type NewsArticle ani Article"];
  }

  if (typeof article.headline !== "string" || article.headline.trim() === "") {
    errors.push("brak headline");
  }

  const published = checkIsoDate(article.datePublished, "datePublished", errors);
  const modified = checkIsoDate(article.dateModified, "dateModified", errors);
  if (published !== null && modified !== null && modified < published) {
    errors.push("dateModified wczesniejsze niz datePublished");
  }

  const author = Array.isArray(article.author) ? article.author[0] : article.author;
  if (!author || typeof author.name !== "string" || author.name.trim() === "") {
    errors.push("brak author.name");
  }

  return errors;
}

function checkIsoDate(value, field, errors) {
  if (typeof value !== "string" || !ISO_8601.test(value)) {
    errors.push(`${field} nie jest data ISO 8601`);
    return null;
  }

  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    errors.push(`${field} nie jest poprawna data`);
    return null;
  }

  return time;
}

/** Sprawdza robots.txt: obie sitemapy na adresie bazowym i wykluczony panel. */
export function checkRobots(text, baseUrl) {
  const errors = [];
  const sitemaps = [...text.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)].map((match) => match[1]);

  for (const path of ["/sitemap.xml", "/sitemap-news.xml"]) {
    if (!sitemaps.includes(`${baseUrl}${path}`)) {
      errors.push(`brak "Sitemap: ${baseUrl}${path}"`);
    }
  }

  if (!/^\s*Disallow:\s*\/admin\s*$/im.test(text)) {
    errors.push('brak "Disallow: /admin"');
  }

  return errors;
}

/** Sprawdza, ze sitemapa ma adresy i ze wszystkie wskazuja na adres bazowy. */
export function checkSitemap(xml, baseUrl, { requireUrls = true } = {}) {
  const errors = [];
  if (!xml.includes("<urlset")) {
    errors.push("brak <urlset>");
  }

  const locs = extractLocs(xml);
  if (requireUrls && locs.length === 0) {
    errors.push("brak adresow <loc>");
  }

  const foreign = locs.filter((loc) => !isSameOrigin(loc, baseUrl));
  if (foreign.length > 0) {
    errors.push(
      `${foreign.length} adres(y) spoza ${new URL(baseUrl).origin}, np. ${foreign[0]} - sprawdz NEXT_PUBLIC_SITE_URL`,
    );
  }

  return errors;
}

/** Czy naglowek Content-Type zawiera oczekiwany typ (bez parametrow typu charset). */
export function hasContentType(header, expected) {
  if (!header) {
    return false;
  }
  return header.split(";")[0].trim().toLowerCase() === expected;
}

/** Raport tekstowy i kod wyjscia: 0 gdy wszystkie kontrole przeszly, 1 w przeciwnym razie. */
export function summarize(results) {
  const lines = results.map((result) =>
    result.errors.length === 0
      ? `  OK    ${result.name}`
      : `  BLAD  ${result.name}\n${result.errors.map((error) => `        - ${error}`).join("\n")}`,
  );
  const failed = results.filter((result) => result.errors.length > 0).length;
  const footer =
    failed === 0
      ? `\nWszystkie kontrole przeszly (${results.length}).`
      : `\nNie przeszlo ${failed} z ${results.length} kontroli.`;

  return { text: `${lines.join("\n")}\n${footer}`, exitCode: failed === 0 ? 0 : 1 };
}
