/**
 * Czyste buildery XML dla sitemap i feedu RSS. Bez zapytan i bez `server-only`,
 * zeby dalo sie je testowac; dane dostarcza lib/public/sitemap-data.ts.
 */

/** Limit adresow w jednym pliku sitemapy (protokol sitemaps.org). */
export const SITEMAP_URL_LIMIT = 50_000;

/** Google News bierze z sitemapy newsowej najwyzej tyle adresow. */
export const NEWS_SITEMAP_URL_LIMIT = 1000;

/** Sitemapa newsowa obejmuje artykuly z ostatnich 48 godzin (docs/architecture.md §8.2). */
export const NEWS_WINDOW_HOURS = 48;

/** Tyle najnowszych artykulow trafia do feedu RSS. */
export const FEED_ITEM_LIMIT = 30;

const HOUR_MS = 60 * 60 * 1000;

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/**
 * Escape tekstu i atrybutow XML. Usuwa tez znaki sterujace, ktorych XML 1.0
 * nie dopuszcza nawet jako encji - jeden taki znak w tytule psuje caly plik.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/[&<>"']/g, (char) => XML_ESCAPES[char] ?? char);
}

/** Adres bezwzgledny z adresu serwisu i sciezki; ukosnik na koncu bazy jest ignorowany. */
export function absoluteUrl(siteUrl: string, path: string): string {
  return `${siteUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function parseDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Data w formacie W3C Datetime (sitemapy): `2026-09-28T08:00:00Z`. */
export function toW3cDate(value: string | Date): string | null {
  const date = parseDate(value);
  return date ? date.toISOString().replace(/\.\d{3}Z$/, "Z") : null;
}

/** Data w formacie RFC 822 wymaganym przez RSS 2.0: `Mon, 28 Sep 2026 08:00:00 GMT`. */
export function toRfc822Date(value: string | Date): string | null {
  const date = parseDate(value);
  return date ? date.toUTCString() : null;
}

/** Pozniejsza z dwoch dat ISO; nieczytelna data przegrywa. */
export function latestDate(a: string, b: string | null): string {
  if (!b) return a;
  const timeA = Date.parse(a);
  const timeB = Date.parse(b);
  if (Number.isNaN(timeB)) return a;
  if (Number.isNaN(timeA)) return b;
  return timeB > timeA ? b : a;
}

export interface SitemapEntry {
  /** Sciezka wzgledna, np. `/transfery/slug`. */
  path: string;
  /** Data ostatniej zmiany (ISO); bez niej `<lastmod>` jest pomijany. */
  lastModified?: string | null;
}

/** Sitemapa `urlset`; wpisy ponad limit 50 000 odpadaja od konca listy. */
export function buildSitemapXml(siteUrl: string, entries: readonly SitemapEntry[]): string {
  const urls = entries.slice(0, SITEMAP_URL_LIMIT).map((entry) => {
    const lastModified = entry.lastModified ? toW3cDate(entry.lastModified) : null;
    return [
      "<url>",
      `<loc>${escapeXml(absoluteUrl(siteUrl, entry.path))}</loc>`,
      lastModified ? `<lastmod>${lastModified}</lastmod>` : null,
      "</url>",
    ]
      .filter((line) => line !== null)
      .join("");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

export interface NewsArticleEntry {
  path: string;
  title: string;
  publishedAt: string;
}

/**
 * Najnowszy moment, od ktorego zapytanie o artykuly do sitemapy newsowej musi
 * siegac. Zaokraglony w dol do pelnej godziny, zeby adres zapytania (klucz
 * Data Cache) zmienial sie raz na godzine, a nie przy kazdym zadaniu.
 */
export function newsQueryCutoff(now: Date): Date {
  const windowStart = now.getTime() - NEWS_WINDOW_HOURS * HOUR_MS;
  return new Date(Math.floor(windowStart / HOUR_MS) * HOUR_MS);
}

/** Artykuly z ostatnich 48 godzin wzgledem `now`, od najnowszego, najwyzej 1000. */
export function selectNewsArticles(
  articles: readonly NewsArticleEntry[],
  now: Date,
): NewsArticleEntry[] {
  const windowStart = now.getTime() - NEWS_WINDOW_HOURS * HOUR_MS;
  return articles
    .filter((article) => {
      const time = Date.parse(article.publishedAt);
      return !Number.isNaN(time) && time >= windowStart;
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, NEWS_SITEMAP_URL_LIMIT);
}

export interface NewsPublication {
  name: string;
  /** Kod jezyka ISO 639, dla serwisu `pl`. */
  language: string;
}

/** Sitemapa Google News. Wejscie powinno juz przejsc przez selectNewsArticles. */
export function buildNewsSitemapXml(
  siteUrl: string,
  publication: NewsPublication,
  articles: readonly NewsArticleEntry[],
): string {
  const urls = articles.slice(0, NEWS_SITEMAP_URL_LIMIT).flatMap((article) => {
    const publishedAt = toW3cDate(article.publishedAt);
    if (!publishedAt) return [];
    return [
      [
        "<url>",
        `<loc>${escapeXml(absoluteUrl(siteUrl, article.path))}</loc>`,
        "<news:news>",
        "<news:publication>",
        `<news:name>${escapeXml(publication.name)}</news:name>`,
        `<news:language>${escapeXml(publication.language)}</news:language>`,
        "</news:publication>",
        `<news:publication_date>${publishedAt}</news:publication_date>`,
        `<news:title>${escapeXml(article.title)}</news:title>`,
        "</news:news>",
        "</url>",
      ].join(""),
    ];
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

export interface FeedChannel {
  title: string;
  description: string;
  language: string;
  /** Sciezka feedu dla `atom:link rel="self"`. */
  feedPath: string;
}

export interface FeedItem {
  id: string;
  title: string;
  path: string;
  publishedAt: string;
  description: string | null;
  category: string | null;
}

/**
 * Feed RSS 2.0. `guid` to identyfikator artykulu, nie adres: adres moze sie
 * zmienic razem ze slugiem, a czytnik pokazalby wtedy ten sam tekst drugi raz.
 */
export function buildRssXml(
  siteUrl: string,
  channel: FeedChannel,
  items: readonly FeedItem[],
): string {
  const renderedItems = items.slice(0, FEED_ITEM_LIMIT).map((item) => {
    const pubDate = toRfc822Date(item.publishedAt);
    return [
      "<item>",
      `<title>${escapeXml(item.title)}</title>`,
      `<link>${escapeXml(absoluteUrl(siteUrl, item.path))}</link>`,
      `<guid isPermaLink="false">urn:uuid:${escapeXml(item.id)}</guid>`,
      pubDate ? `<pubDate>${pubDate}</pubDate>` : null,
      item.description ? `<description>${escapeXml(item.description)}</description>` : null,
      item.category ? `<category>${escapeXml(item.category)}</category>` : null,
      "</item>",
    ]
      .filter((line) => line !== null)
      .join("");
  });

  const newest = items[0] ? toRfc822Date(items[0].publishedAt) : null;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${escapeXml(channel.title)}</title>`,
    `<link>${escapeXml(absoluteUrl(siteUrl, "/"))}</link>`,
    `<description>${escapeXml(channel.description)}</description>`,
    `<language>${escapeXml(channel.language)}</language>`,
    `<atom:link href="${escapeXml(absoluteUrl(siteUrl, channel.feedPath))}" rel="self" type="application/rss+xml"/>`,
    newest ? `<lastBuildDate>${newest}</lastBuildDate>` : null,
    ...renderedItems,
    "</channel>",
    "</rss>",
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}
