import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FeedParseError, parseFeed } from "@shared/lib/rss.ts";

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/sources/${name}`, import.meta.url), "utf8");
}

describe("parseFeed RSS", () => {
  it("czyta piec materialow z zapisanej odpowiedzi", () => {
    const feed = parseFeed(fixture("bruno-contract.rss.xml"));

    expect(feed.format).toBe("rss");
    expect(feed.items).toHaveLength(5);
    expect(feed.items[0]?.title).toMatch(/Bruno Fernandes/);
    expect(feed.items[0]?.url).toBe("https://example.test/news/bruno-1");
    expect(feed.items[0]?.content).toMatch(/Oficjalne/);
    expect(feed.items[0]?.publishedAt).toBe("2025-01-01T12:00:00.000Z");
  });
});

describe("parseFeed Atom", () => {
  it("bierze link rel=alternate i autora", () => {
    const feed = parseFeed(fixture("lewandowski.atom.xml"));

    expect(feed.format).toBe("atom");
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]?.url).toBe("https://example.test/atom/1");
    expect(feed.items[0]?.author).toBe("Redaktor");
  });
});

describe("parseFeed JSON", () => {
  it("czyta items[] z url i tytulem", () => {
    const feed = parseFeed(fixture("legia.json"));

    expect(feed.format).toBe("json");
    expect(feed.items[0]?.title).toMatch(/Legia/);
    expect(feed.items[0]?.url).toBe("https://example.test/json/legia-1");
  });
});

describe("parseFeed bledy", () => {
  it("odrzuca pusty i nieznany format", () => {
    expect(() => parseFeed("")).toThrow(FeedParseError);
    expect(() => parseFeed("<html>brak feedu</html>")).toThrow(FeedParseError);
    expect(() => parseFeed("{not-json")).toThrow(FeedParseError);
  });

  it("pomija wpisy bez tytulu albo adresu", () => {
    const feed = parseFeed(
      `<rss><channel><item><title></title><link></link></item></channel></rss>`,
    );
    expect(feed.items).toEqual([]);
  });
});
