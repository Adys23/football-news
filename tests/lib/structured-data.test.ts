import { describe, expect, it } from "vitest";
import type { PublicArticle } from "@/lib/public/article";
import { buildArticleMetadata } from "@/lib/seo/metadata";
import {
  absoluteUrl,
  articleModifiedAt,
  buildBreadcrumbJsonLd,
  buildNewsArticleJsonLd,
  serializeJsonLd,
} from "@/lib/seo/structured-data";
import { SITE } from "@/lib/site";

const SITE_URL = "https://newsroom.example";

function article(overrides: Partial<PublicArticle> = {}): PublicArticle {
  return {
    id: "article-1",
    slug: "bruno-fernandes-przedluza-kontrakt",
    title: "Bruno Fernandes przedłuża kontrakt z Manchesterem United",
    lead: "Klub potwierdził nową umowę.",
    seoTitle: null,
    seoDescription: null,
    blocks: [{ type: "paragraph", text: "Treść." }],
    publishedAt: "2026-09-28T10:00:00+00:00",
    updatedAt: "2026-09-28T10:00:05+00:00",
    aiGenerated: true,
    category: { name: "Transfery", slug: "transfery" },
    author: { name: "Anna Nowak", slug: "anna-nowak", roleTitle: "Redaktorka" },
    updates: [],
    heroImage: null,
    ...overrides,
  };
}

describe("absoluteUrl", () => {
  it("resolves paths against the site url and keeps absolute urls", () => {
    expect(absoluteUrl(SITE_URL, "/transfery/abc")).toBe("https://newsroom.example/transfery/abc");
    expect(absoluteUrl(`${SITE_URL}/`, "/")).toBe("https://newsroom.example/");
    expect(absoluteUrl(SITE_URL, "https://cdn.example/a.jpg")).toBe("https://cdn.example/a.jpg");
  });
});

describe("articleModifiedAt", () => {
  it("returns the latest of publication, edit and approved update as ISO", () => {
    expect(
      articleModifiedAt(
        article({
          updates: [
            { id: "u2", body: "Druga", publishedAt: "2026-09-28T15:30:00+02:00" },
            { id: "u1", body: "Pierwsza", publishedAt: "2026-09-28T11:00:00Z" },
          ],
        }),
      ),
    ).toBe("2026-09-28T13:30:00.000Z");
  });

  it("never goes before the publication date", () => {
    expect(articleModifiedAt(article({ updatedAt: "2026-09-27T08:00:00Z", updates: [] }))).toBe(
      "2026-09-28T10:00:00.000Z",
    );
  });

  it("throws on an unparsable date instead of emitting garbage", () => {
    expect(() => articleModifiedAt(article({ updatedAt: "wczoraj" }))).toThrow(/Niepoprawna data/);
  });
});

describe("buildNewsArticleJsonLd", () => {
  it("describes the article with absolute urls and ISO dates", () => {
    const jsonLd = buildNewsArticleJsonLd(article(), SITE_URL);

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: "Bruno Fernandes przedłuża kontrakt z Manchesterem United",
      datePublished: "2026-09-28T10:00:00.000Z",
      dateModified: "2026-09-28T10:00:05.000Z",
      isAccessibleForFree: true,
      articleSection: "Transfery",
      description: "Klub potwierdził nową umowę.",
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": "https://newsroom.example/transfery/bruno-fernandes-przedluza-kontrakt",
      },
      author: { "@type": "Person", name: "Anna Nowak" },
      publisher: { "@type": "Organization", name: SITE.name, url: "https://newsroom.example/" },
    });
    expect(jsonLd).not.toHaveProperty("image");
  });

  it("includes a licensed hero image and prefers the SEO description", () => {
    const jsonLd = buildNewsArticleJsonLd(
      article({
        seoDescription: "Opis SEO.",
        heroImage: { url: "/storage/hero.jpg", width: 1600, height: 900, alt: "Stadion" },
      }),
      SITE_URL,
    );

    expect(jsonLd.description).toBe("Opis SEO.");
    expect(jsonLd.image).toEqual([
      {
        "@type": "ImageObject",
        url: "https://newsroom.example/storage/hero.jpg",
        width: 1600,
        height: 900,
        caption: "Stadion",
      },
    ]);
  });

  it("falls back to the publisher as author and the default category path", () => {
    const jsonLd = buildNewsArticleJsonLd(article({ author: null, category: null }), SITE_URL);

    expect(jsonLd.author).toEqual(jsonLd.publisher);
    expect(jsonLd.url).toBe(
      "https://newsroom.example/pilka-nozna/bruno-fernandes-przedluza-kontrakt",
    );
    expect(jsonLd).not.toHaveProperty("articleSection");
  });
});

describe("buildBreadcrumbJsonLd", () => {
  it("lists home, category and article with absolute urls", () => {
    expect(buildBreadcrumbJsonLd(article(), SITE_URL).itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Strona główna",
        item: "https://newsroom.example/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Transfery",
        item: "https://newsroom.example/transfery",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Bruno Fernandes przedłuża kontrakt z Manchesterem United",
        item: "https://newsroom.example/transfery/bruno-fernandes-przedluza-kontrakt",
      },
    ]);
  });

  it("skips the category level when the article has none", () => {
    const items = buildBreadcrumbJsonLd(article({ category: null }), SITE_URL).itemListElement;

    expect(
      Array.isArray(items) ? items.map((item) => (item as { position: number }).position) : [],
    ).toEqual([1, 2]);
  });
});

describe("serializeJsonLd", () => {
  it("escapes characters that could close the script tag", () => {
    const json = serializeJsonLd({ headline: "</script><script>alert(1)</script> & \u2028" });

    expect(json).not.toMatch(/[<>&\u2028]/);
    expect(json).toContain("\\u003c/script\\u003e");
    expect(JSON.parse(json)).toEqual({ headline: "</script><script>alert(1)</script> & \u2028" });
  });
});

describe("buildArticleMetadata", () => {
  it("sets canonical, Open Graph article fields, Twitter card and robots", () => {
    const metadata = buildArticleMetadata(
      article({
        seoTitle: "Fernandes zostaje w United do 2029 roku",
        heroImage: { url: "https://cdn.example/a.jpg", width: 1600, height: 900, alt: "Stadion" },
        updates: [{ id: "u1", body: "Nowe", publishedAt: "2026-09-28T12:00:00Z" }],
      }),
      SITE_URL,
    );
    const url = "https://newsroom.example/transfery/bruno-fernandes-przedluza-kontrakt";

    expect(metadata.title).toEqual({ absolute: "Fernandes zostaje w United do 2029 roku" });
    expect(metadata.openGraph?.title).toBe("Fernandes zostaje w United do 2029 roku");
    expect(metadata.alternates).toEqual({ canonical: url });
    expect(metadata.openGraph).toMatchObject({
      type: "article",
      url,
      publishedTime: "2026-09-28T10:00:00.000Z",
      modifiedTime: "2026-09-28T12:00:00.000Z",
      section: "Transfery",
      authors: ["Anna Nowak"],
      images: [{ url: "https://cdn.example/a.jpg", width: 1600, height: 900, alt: "Stadion" }],
    });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(metadata.robots).toMatchObject({
      "max-image-preview": "large",
      googleBot: { "max-image-preview": "large" },
    });
  });

  it("uses the lead and a small card when there is no SEO description or image", () => {
    const metadata = buildArticleMetadata(article(), SITE_URL);

    expect(metadata.title).toBe("Bruno Fernandes przedłuża kontrakt z Manchesterem United");
    expect(metadata.description).toBe("Klub potwierdził nową umowę.");
    expect(metadata.twitter).toMatchObject({ card: "summary" });
  });
});
