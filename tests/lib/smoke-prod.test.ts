import { describe, expect, it } from "vitest";
import {
  checkArticleJsonLd,
  checkRobots,
  checkSitemap,
  extractJsonLdBlocks,
  extractLocs,
  findArticlePathInLocs,
  hasContentType,
  normalizeBaseUrl,
  summarize,
} from "@/scripts/lib/smoke-prod.mjs";

const BASE = "https://example.pl";

function articleHtml(jsonLd: unknown[]): string {
  const scripts = jsonLd
    .map((value) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`)
    .join("");
  return `<!doctype html><html><head>${scripts}</head><body></body></html>`;
}

const NEWS_ARTICLE = {
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  headline: "Zawodnik przedluzyl kontrakt",
  datePublished: "2026-09-01T10:00:00.000Z",
  dateModified: "2026-09-02T08:30:00.000Z",
  author: { "@type": "Organization", name: "Redakcja" },
};

const BREADCRUMB = { "@context": "https://schema.org", "@type": "BreadcrumbList" };

describe("normalizeBaseUrl", () => {
  it("usuwa koncowy ukosnik", () => {
    expect(normalizeBaseUrl("https://example.pl/")).toBe(BASE);
  });

  it("odrzuca brak adresu, niepoprawny adres i inny protokol", () => {
    expect(() => normalizeBaseUrl(undefined)).toThrow("Brak --base-url");
    expect(() => normalizeBaseUrl("example.pl")).toThrow("Niepoprawny");
    expect(() => normalizeBaseUrl("ftp://example.pl")).toThrow("http(s)");
  });
});

describe("sitemapy", () => {
  const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://example.pl/</loc></url>
    <url><loc>https://example.pl/transfery</loc></url>
    <url><loc>https://example.pl/zawodnicy/jan-kowalski</loc></url>
    <url><loc>https://example.pl/o-nas/zasady-redakcyjne</loc></url>
    <url><loc>https://example.pl/transfery/zawodnik-przedluzyl?a=1&amp;b=2</loc></url>
  </urlset>`;

  it("wyciaga adresy i dekoduje encje", () => {
    expect(extractLocs(xml)).toContain("https://example.pl/transfery/zawodnik-przedluzyl?a=1&b=2");
  });

  it("wybiera pierwszy artykul, pomijajac kategorie i profile", () => {
    expect(findArticlePathInLocs(extractLocs(xml), BASE)).toBe("/transfery/zawodnik-przedluzyl");
  });

  it("nie bierze artykulu z innego hosta", () => {
    expect(findArticlePathInLocs(["https://inny.pl/transfery/slug"], BASE)).toBeNull();
  });

  it("poprawna sitemapa nie ma bledow", () => {
    expect(checkSitemap(xml, BASE)).toEqual([]);
  });

  it("wykrywa adresy z innego hosta (zly NEXT_PUBLIC_SITE_URL)", () => {
    const errors = checkSitemap(
      "<urlset><url><loc>http://localhost:3000/</loc></url></urlset>",
      BASE,
    );
    expect(errors.join()).toContain("NEXT_PUBLIC_SITE_URL");
  });

  it("pusta sitemapa jest bledem, chyba ze adresy nie sa wymagane", () => {
    expect(checkSitemap("<urlset></urlset>", BASE)).toEqual(["brak adresow <loc>"]);
    expect(checkSitemap("<urlset></urlset>", BASE, { requireUrls: false })).toEqual([]);
  });

  it("brak urlset jest bledem", () => {
    expect(checkSitemap("<html></html>", BASE, { requireUrls: false })).toEqual(["brak <urlset>"]);
  });
});

describe("checkRobots", () => {
  const robots = [
    "User-Agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /login",
    "",
    "Sitemap: https://example.pl/sitemap.xml",
    "Sitemap: https://example.pl/sitemap-news.xml",
  ].join("\n");

  it("poprawny robots.txt", () => {
    expect(checkRobots(robots, BASE)).toEqual([]);
  });

  it("sitemapy na innym hoscie i brak blokady panelu", () => {
    const errors = checkRobots(
      "User-Agent: *\nSitemap: http://localhost:3000/sitemap.xml\nSitemap: http://localhost:3000/sitemap-news.xml",
      BASE,
    );
    expect(errors).toEqual([
      'brak "Sitemap: https://example.pl/sitemap.xml"',
      'brak "Sitemap: https://example.pl/sitemap-news.xml"',
      'brak "Disallow: /admin"',
    ]);
  });
});

describe("checkArticleJsonLd", () => {
  it("poprawny NewsArticle obok BreadcrumbList", () => {
    expect(checkArticleJsonLd(articleHtml([BREADCRUMB, NEWS_ARTICLE]))).toEqual([]);
  });

  it("akceptuje Article i autora w tablicy", () => {
    const article = { ...NEWS_ARTICLE, "@type": "Article", author: [{ name: "Jan Nowak" }] };
    expect(checkArticleJsonLd(articleHtml([article]))).toEqual([]);
  });

  it("brak JSON-LD", () => {
    expect(checkArticleJsonLd("<html></html>")).toEqual(["brak <script type=application/ld+json>"]);
  });

  it("brak bloku artykulu", () => {
    expect(checkArticleJsonLd(articleHtml([BREADCRUMB]))).toEqual([
      "brak bloku @type NewsArticle ani Article",
    ]);
  });

  it("niepoprawny JSON", () => {
    const html = '<script type="application/ld+json">{nie json</script>';
    expect(checkArticleJsonLd(html)).toContain("JSON-LD nie jest poprawnym JSON-em");
  });

  it("dateModified przed datePublished", () => {
    const article = { ...NEWS_ARTICLE, dateModified: "2026-08-31T10:00:00Z" };
    expect(checkArticleJsonLd(articleHtml([article]))).toEqual([
      "dateModified wczesniejsze niz datePublished",
    ]);
  });

  it("daty spoza ISO 8601, brak tytulu i autora", () => {
    const article = {
      "@type": "NewsArticle",
      headline: " ",
      datePublished: "1 wrzesnia 2026",
      dateModified: "2026-09-02",
    };
    expect(checkArticleJsonLd(articleHtml([article]))).toEqual([
      "brak headline",
      "datePublished nie jest data ISO 8601",
      "dateModified nie jest data ISO 8601",
      "brak author.name",
    ]);
  });

  it("przesuniecie strefy czasowej jest poprawne", () => {
    const article = {
      ...NEWS_ARTICLE,
      datePublished: "2026-09-01T12:00:00+02:00",
      dateModified: "2026-09-01T10:00:00Z",
    };
    expect(checkArticleJsonLd(articleHtml([article]))).toEqual([]);
  });

  it("wyciaga wszystkie bloki JSON-LD", () => {
    expect(extractJsonLdBlocks(articleHtml([BREADCRUMB, NEWS_ARTICLE]))).toHaveLength(2);
  });
});

describe("hasContentType", () => {
  it("porownuje typ bez parametrow", () => {
    expect(hasContentType("application/xml; charset=utf-8", "application/xml")).toBe(true);
    expect(hasContentType("text/html", "application/xml")).toBe(false);
    expect(hasContentType(null, "text/html")).toBe(false);
  });
});

describe("summarize", () => {
  it("wszystko OK daje kod 0", () => {
    const { text, exitCode } = summarize([{ name: "GET /", errors: [] }]);
    expect(exitCode).toBe(0);
    expect(text).toContain("Wszystkie kontrole przeszly (1)");
  });

  it("blad daje kod 1 i liste bledow", () => {
    const { text, exitCode } = summarize([
      { name: "GET /", errors: [] },
      { name: "GET /feed.xml", errors: ["HTTP 500, oczekiwane 200"] },
    ]);
    expect(exitCode).toBe(1);
    expect(text).toContain("BLAD  GET /feed.xml");
    expect(text).toContain("- HTTP 500, oczekiwane 200");
    expect(text).toContain("Nie przeszlo 1 z 2 kontroli.");
  });
});
