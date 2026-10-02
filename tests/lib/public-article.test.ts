import { describe, expect, it } from "vitest";
import { toPublicArticle, type PublishedArticleRow } from "@/lib/public/article";
import { CACHE_TAGS } from "@/lib/public/cache-tags";
import { formatPublicDateTime } from "@/lib/public/format";
import { DEFAULT_CATEGORY_SLUG, articlePath, isValidSlug } from "@/lib/public/paths";

function row(overrides: Partial<PublishedArticleRow> = {}): PublishedArticleRow {
  return {
    id: "article-1",
    slug: "bruno-fernandes-przedluza-kontrakt",
    title: "Bruno Fernandes przedłuża kontrakt z Manchesterem United",
    lead: "Klub potwierdził nową umowę.",
    content: { version: 1, blocks: [{ type: "paragraph", text: "Treść." }] },
    seo_title: null,
    seo_description: null,
    published_at: "2026-09-28T10:00:00Z",
    updated_at: "2026-09-28T10:00:00Z",
    ai_generated: true,
    categories: { name: "Transfery", slug: "transfery" },
    authors: { name: "Redaktor", slug: "redaktor", role_title: null },
    article_updates: [],
    hero_image: null,
    ...overrides,
  };
}

describe("toPublicArticle", () => {
  it("maps the row and keeps parsed blocks", () => {
    const article = toPublicArticle(row());

    expect(article.blocks).toEqual([{ type: "paragraph", text: "Treść." }]);
    expect(article.publishedAt).toBe("2026-09-28T10:00:00Z");
    expect(article.author).toEqual({ name: "Redaktor", slug: "redaktor", roleTitle: null });
    expect(article.category).toEqual({ name: "Transfery", slug: "transfery" });
  });

  it("orders approved updates newest first and hides unapproved ones", () => {
    const article = toPublicArticle(
      row({
        article_updates: [
          { id: "u1", body: "Pierwsza", published_at: "2026-09-28T11:00:00Z", approved_by: "ed" },
          { id: "u2", body: "Druga", published_at: "2026-09-28T13:00:00Z", approved_by: "ed" },
          { id: "u3", body: "Szkic", published_at: "2026-09-28T14:00:00Z", approved_by: null },
        ],
      }),
    );

    expect(article.updates.map((update) => update.id)).toEqual(["u2", "u1"]);
  });

  it("keeps a hero image only when it has a license and is not AI generated", () => {
    const image = {
      id: "77777777-7777-4777-8777-777777777771",
      kind: "hero" as const,
      url: "https://cdn.example/a.jpg",
      width: 1600,
      height: 900,
      alt: "Stadion",
      license: "CC BY 4.0",
      source: "PAP",
      photographer: "Jan Nowak",
      copyright: null,
      is_ai_generated: false,
    };

    expect(toPublicArticle(row({ hero_image: image })).heroImage).toEqual({
      id: image.id,
      kind: "hero",
      url: image.url,
      width: 1600,
      height: 900,
      alt: "Stadion",
      attribution: "Fot. Jan Nowak / PAP, CC BY 4.0",
    });
    expect(toPublicArticle(row({ hero_image: { ...image, license: "  " } })).heroImage).toBeNull();
    expect(
      toPublicArticle(row({ hero_image: { ...image, is_ai_generated: true } })).heroImage,
    ).toBeNull();
  });

  it("throws on content that does not match the block schema", () => {
    expect(() =>
      toPublicArticle(row({ content: { version: 1, blocks: [{ type: "html" }] } })),
    ).toThrow(/niezgodna ze schematem/);
  });

  it("throws when a published article has no published_at", () => {
    expect(() => toPublicArticle(row({ published_at: null }))).toThrow(/published_at/);
  });
});

describe("paths", () => {
  it("builds the canonical path from the category", () => {
    expect(articlePath({ slug: "abc", categorySlug: "transfery" })).toBe("/transfery/abc");
  });

  it("falls back to the default category", () => {
    expect(articlePath({ slug: "abc", categorySlug: null })).toBe(`/${DEFAULT_CATEGORY_SLUG}/abc`);
  });

  it.each(["abc", "jan-kowalski-2", "a1-b2-c3"])("accepts slug %s", (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each(["", "Abc", "a--b", "-a", "a-", "a/b", "ą", "a".repeat(121)])(
    "rejects slug %j",
    (slug) => {
      expect(isValidSlug(slug)).toBe(false);
    },
  );
});

describe("cache tags", () => {
  it("namespaces article and category tags", () => {
    expect(CACHE_TAGS.article("abc")).toBe("article:abc");
    expect(CACHE_TAGS.category("transfery")).toBe("category:transfery");
  });
});

describe("formatPublicDateTime", () => {
  it("formats in Polish time regardless of server time zone", () => {
    expect(formatPublicDateTime("2026-09-28T12:05:00Z")).toMatch(/28 września 2026.*14:05/);
  });
});
