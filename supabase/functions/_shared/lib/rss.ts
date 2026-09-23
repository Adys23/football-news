/**
 * Parser RSS 2.0, Atom i prostych feedow JSON. Bez scrapowania HTML.
 * Wejscie to cialo odpowiedzi HTTP zapisane w fixtures - nigdy siec w testach.
 */

export type ParsedFeedItem = {
  externalId: string | null;
  url: string;
  title: string;
  content: string | null;
  author: string | null;
  publishedAt: string | null;
};

export type FeedFormat = "rss" | "atom" | "json";

export type ParsedFeed = {
  format: FeedFormat;
  items: ParsedFeedItem[];
};

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedParseError";
  }
}

export function parseFeed(body: string): ParsedFeed {
  const trimmed = body.trim();

  if (trimmed.length === 0) {
    throw new FeedParseError("Pusty feed.");
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return { format: "json", items: parseJsonFeed(trimmed) };
  }

  if (/<feed[\s>]/i.test(trimmed)) {
    return { format: "atom", items: parseAtom(trimmed) };
  }

  if (/<rss[\s>]|<channel[\s>]/i.test(trimmed)) {
    return { format: "rss", items: parseRss(trimmed) };
  }

  throw new FeedParseError("Nieznany format feedu. Oczekiwano RSS, Atom albo JSON.");
}

function parseRss(xml: string): ParsedFeedItem[] {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap((match) => {
    const block = match[1] ?? "";
    return itemFromFields({
      title: firstTag(block, "title"),
      url: firstTag(block, "link") ?? firstTag(block, "guid"),
      externalId: firstTag(block, "guid") ?? firstTag(block, "link"),
      content: firstTag(block, "description") ?? firstTag(block, "content:encoded"),
      author: firstTag(block, "author") ?? firstTag(block, "dc:creator"),
      published: firstTag(block, "pubDate") ?? firstTag(block, "dc:date"),
    });
  });
}

function parseAtom(xml: string): ParsedFeedItem[] {
  return [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].flatMap((match) => {
    const block = match[1] ?? "";
    const alternate = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
    const anyLink = block.match(/<link\b[^>]*href=["']([^"']+)["']/i);

    return itemFromFields({
      title: firstTag(block, "title"),
      url: alternate?.[1] ?? anyLink?.[1] ?? firstTag(block, "id"),
      externalId: firstTag(block, "id") ?? alternate?.[1] ?? null,
      content: firstTag(block, "summary") ?? firstTag(block, "content"),
      author: firstTag(block, "name"),
      published: firstTag(block, "updated") ?? firstTag(block, "published"),
    });
  });
}

function parseJsonFeed(body: string): ParsedFeedItem[] {
  let data: unknown;

  try {
    data = JSON.parse(body);
  } catch {
    throw new FeedParseError("Feed JSON jest niepoprawny.");
  }

  const rows = jsonRows(data);

  return rows.flatMap((row) => {
    if (!isRecord(row)) {
      return [];
    }

    const url = stringField(row, ["url", "link", "guid", "id"]);
    const title = stringField(row, ["title", "headline", "name"]);

    return itemFromFields({
      title,
      url,
      externalId: stringField(row, ["guid", "id", "url"]),
      content: stringField(row, ["summary", "description", "content"]),
      author: stringField(row, ["author", "creator"]),
      published: stringField(row, ["publishedAt", "published", "date", "pubDate"]),
    });
  });
}

function jsonRows(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (!isRecord(data)) {
    return [];
  }

  for (const key of ["items", "articles", "entries", "results"]) {
    const value = data[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function itemFromFields(fields: {
  title: string | null;
  url: string | null;
  externalId: string | null;
  content: string | null;
  author: string | null;
  published: string | null;
}): ParsedFeedItem[] {
  const title = fields.title?.trim() ?? "";
  const url = fields.url?.trim() ?? "";

  if (!title || !url) {
    return [];
  }

  return [
    {
      title,
      url,
      externalId: fields.externalId?.trim() || url,
      content: fields.content?.trim() || null,
      author: fields.author?.trim() || null,
      publishedAt: toIso(fields.published),
    },
  ];
}

function firstTag(block: string, name: string): string | null {
  const pattern = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i");
  const match = pattern.exec(block);
  if (!match?.[1]) {
    return null;
  }

  return decodeXml(stripCdata(match[1])).trim() || null;
}

function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&");
}

function toIso(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}
