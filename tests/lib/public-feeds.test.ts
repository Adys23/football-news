import { describe, expect, it } from "vitest";
import {
  FEED_PATH,
  NEWS_SITEMAP_PATH,
  SITEMAP_PATH,
  isReservedPathSegment,
} from "@/lib/public/paths";
import {
  FEED_ITEM_LIMIT,
  NEWS_SITEMAP_URL_LIMIT,
  SITEMAP_URL_LIMIT,
  absoluteUrl,
  buildNewsSitemapXml,
  buildRssXml,
  buildSitemapXml,
  escapeXml,
  latestDate,
  newsQueryCutoff,
  selectNewsArticles,
  toRfc822Date,
  toW3cDate,
  type FeedItem,
  type NewsArticleEntry,
} from "@/lib/public/xml-feeds";

const SITE_URL = "https://example.pl";
const NOW = new Date("2026-09-28T12:30:00Z");
const HOUR = 60 * 60 * 1000;

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * HOUR).toISOString();
}

function countOf(xml: string, needle: string): number {
  return xml.split(needle).length - 1;
}

describe("escapeXml", () => {
  it("escapes the five XML special characters", () => {
    expect(escapeXml(`Legia & "Lech" <'derby'>`)).toBe(
      "Legia &amp; &quot;Lech&quot; &lt;&apos;derby&apos;&gt;",
    );
  });

  it("does not double-escape and keeps Polish letters", () => {
    expect(escapeXml("Łódź &amp; Śląsk")).toBe("Łódź &amp;amp; Śląsk");
  });

  it("drops control characters that XML 1.0 forbids", () => {
    expect(escapeXml("Gol\u0000 w\u000B 90.\u0008 minucie\tteraz\n")).toBe(
      "Gol w 90. minucie\tteraz\n",
    );
  });
});

describe("absoluteUrl", () => {
  it("joins the site URL and path with exactly one slash", () => {
    expect(absoluteUrl("https://example.pl/", "/transfery/a")).toBe(
      "https://example.pl/transfery/a",
    );
    expect(absoluteUrl("https://example.pl", "transfery")).toBe("https://example.pl/transfery");
    expect(absoluteUrl("https://example.pl", "/")).toBe("https://example.pl/");
  });
});

describe("date formats", () => {
  it("formats W3C datetime without milliseconds, in UTC", () => {
    expect(toW3cDate("2026-09-28T10:00:00.123+02:00")).toBe("2026-09-28T08:00:00Z");
    expect(toW3cDate(new Date("2026-01-02T03:04:05Z"))).toBe("2026-01-02T03:04:05Z");
  });

  it("formats RFC 822 dates for RSS", () => {
    expect(toRfc822Date("2026-09-28T08:00:00+00:00")).toBe("Mon, 28 Sep 2026 08:00:00 GMT");
  });

  it("returns null for unreadable dates", () => {
    expect(toW3cDate("nie-data")).toBeNull();
    expect(toRfc822Date("nie-data")).toBeNull();
  });

  it("picks the later of publication and modification", () => {
    expect(latestDate("2026-09-28T08:00:00Z", "2026-09-28T09:00:00Z")).toBe("2026-09-28T09:00:00Z");
    expect(latestDate("2026-09-28T08:00:00Z", "2026-09-27T09:00:00Z")).toBe("2026-09-28T08:00:00Z");
    expect(latestDate("2026-09-28T08:00:00Z", null)).toBe("2026-09-28T08:00:00Z");
    expect(latestDate("2026-09-28T08:00:00Z", "zle")).toBe("2026-09-28T08:00:00Z");
  });
});

describe("buildSitemapXml", () => {
  it("renders escaped absolute locations and optional lastmod", () => {
    const xml = buildSitemapXml(SITE_URL, [
      { path: "/", lastModified: "2026-09-28T08:00:00+00:00" },
      { path: "/o-nas" },
      { path: "/szukaj?q=a&b=<c>" },
    ]);

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(
      "<url><loc>https://example.pl/</loc><lastmod>2026-09-28T08:00:00Z</lastmod></url>",
    );
    expect(xml).toContain("<url><loc>https://example.pl/o-nas</loc></url>");
    expect(xml).toContain("<loc>https://example.pl/szukaj?q=a&amp;b=&lt;c&gt;</loc>");
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  it("caps the file at 50 000 URLs, dropping entries from the end", () => {
    const entries = Array.from({ length: SITEMAP_URL_LIMIT + 5 }, (_, index) => ({
      path: `/a/${index}`,
    }));
    const xml = buildSitemapXml(SITE_URL, entries);

    expect(countOf(xml, "<url>")).toBe(SITEMAP_URL_LIMIT);
    expect(xml).toContain(`/a/${SITEMAP_URL_LIMIT - 1}<`);
    expect(xml).not.toContain(`/a/${SITEMAP_URL_LIMIT}<`);
  });
});

describe("news sitemap window", () => {
  const articles: NewsArticleEntry[] = [
    { path: "/a/stary", title: "Stary", publishedAt: hoursAgo(48.01) },
    { path: "/a/granica", title: "Granica", publishedAt: hoursAgo(48) },
    { path: "/a/nowy", title: "Nowy", publishedAt: hoursAgo(1) },
    { path: "/a/sredni", title: "Sredni", publishedAt: hoursAgo(24) },
    { path: "/a/zly", title: "Zla data", publishedAt: "nie-data" },
  ];

  it("keeps only the last 48 hours, newest first", () => {
    expect(selectNewsArticles(articles, NOW).map((article) => article.path)).toEqual([
      "/a/nowy",
      "/a/sredni",
      "/a/granica",
    ]);
  });

  it("limits the news sitemap to 1000 URLs", () => {
    const many = Array.from({ length: NEWS_SITEMAP_URL_LIMIT + 10 }, (_, index) => ({
      path: `/a/${index}`,
      title: `T${index}`,
      publishedAt: hoursAgo(index / 100),
    }));
    const selected = selectNewsArticles(many, NOW);

    expect(selected).toHaveLength(NEWS_SITEMAP_URL_LIMIT);
    expect(selected[0]?.path).toBe("/a/0");
  });

  it("queries from a full hour at or before the 48-hour window start", () => {
    const cutoff = newsQueryCutoff(NOW);

    expect(cutoff.toISOString()).toBe("2026-09-26T12:00:00.000Z");
    expect(cutoff.getTime()).toBeLessThanOrEqual(NOW.getTime() - 48 * HOUR);
    expect(newsQueryCutoff(new Date("2026-09-28T12:59:59Z"))).toEqual(cutoff);
  });
});

describe("buildNewsSitemapXml", () => {
  it("renders the Google News namespace with publication, date and escaped title", () => {
    const xml = buildNewsSitemapXml(SITE_URL, { name: "Newsroom & Co", language: "pl" }, [
      {
        path: "/transfery/legia-lech",
        title: `Legia & Lech: "derby" <remis>`,
        publishedAt: "2026-09-28T10:00:00+02:00",
      },
    ]);

    expect(xml).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"');
    expect(xml).toContain(
      [
        "<url><loc>https://example.pl/transfery/legia-lech</loc>",
        "<news:news><news:publication><news:name>Newsroom &amp; Co</news:name>",
        "<news:language>pl</news:language></news:publication>",
        "<news:publication_date>2026-09-28T08:00:00Z</news:publication_date>",
        "<news:title>Legia &amp; Lech: &quot;derby&quot; &lt;remis&gt;</news:title>",
        "</news:news></url>",
      ].join(""),
    );
  });

  it("renders an empty urlset when nothing was published in 48 hours", () => {
    const xml = buildNewsSitemapXml(SITE_URL, { name: "N", language: "pl" }, []);

    expect(countOf(xml, "<url>")).toBe(0);
    expect(xml).toContain("</urlset>");
  });
});

describe("buildRssXml", () => {
  const channel = {
    title: "Newsroom <Pilkarski>",
    description: "Opis & zasady",
    language: "pl",
    feedPath: FEED_PATH,
  };
  const item: FeedItem = {
    id: "dddddddd-0000-4000-8000-000000000003",
    title: "Lewandowski & Barcelona <gol>",
    path: "/transfery/lewandowski",
    publishedAt: "2026-09-28T08:00:00Z",
    description: `Lead z "cudzyslowem"`,
    category: "Transfery",
  };

  it("renders an RSS 2.0 channel with atom:link self and the newest date", () => {
    const xml = buildRssXml(SITE_URL, channel, [item]);

    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">');
    expect(xml).toContain("<title>Newsroom &lt;Pilkarski&gt;</title>");
    expect(xml).toContain("<link>https://example.pl/</link>");
    expect(xml).toContain("<description>Opis &amp; zasady</description>");
    expect(xml).toContain("<language>pl</language>");
    expect(xml).toContain(
      '<atom:link href="https://example.pl/feed.xml" rel="self" type="application/rss+xml"/>',
    );
    expect(xml).toContain("<lastBuildDate>Mon, 28 Sep 2026 08:00:00 GMT</lastBuildDate>");
  });

  it("renders escaped items with a stable, non-permalink guid", () => {
    const xml = buildRssXml(SITE_URL, channel, [item]);

    expect(xml).toContain(
      [
        "<item><title>Lewandowski &amp; Barcelona &lt;gol&gt;</title>",
        "<link>https://example.pl/transfery/lewandowski</link>",
        '<guid isPermaLink="false">urn:uuid:dddddddd-0000-4000-8000-000000000003</guid>',
        "<pubDate>Mon, 28 Sep 2026 08:00:00 GMT</pubDate>",
        "<description>Lead z &quot;cudzyslowem&quot;</description>",
        "<category>Transfery</category></item>",
      ].join(""),
    );
  });

  it("omits empty optional fields and caps the number of items", () => {
    const items = Array.from({ length: FEED_ITEM_LIMIT + 3 }, (_, index) => ({
      ...item,
      id: `id-${index}`,
      description: null,
      category: null,
    }));
    const xml = buildRssXml(SITE_URL, channel, items);

    expect(countOf(xml, "<item>")).toBe(FEED_ITEM_LIMIT);
    expect(xml).not.toContain("<category>");
    expect(countOf(xml, "<description>")).toBe(1);
  });

  it("has no lastBuildDate for an empty feed", () => {
    expect(buildRssXml(SITE_URL, channel, [])).not.toContain("lastBuildDate");
  });
});

describe("feed paths", () => {
  it("are reserved top-level segments, so no category can shadow them", () => {
    for (const path of [SITEMAP_PATH, NEWS_SITEMAP_PATH, FEED_PATH]) {
      expect(isReservedPathSegment(path.slice(1))).toBe(true);
    }
  });
});
