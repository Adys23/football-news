import { describe, expect, it } from "vitest";
import {
  categoryArticlesFilter,
  toArticleCard,
  toPublicCategory,
  type ArticleCardRow,
} from "@/lib/public/cards";
import { DEFAULT_CATEGORY_SLUG, categoryPath } from "@/lib/public/paths";

function cardRow(overrides: Partial<ArticleCardRow> = {}): ArticleCardRow {
  return {
    id: "article-1",
    slug: "bruno-fernandes-przedluza-kontrakt",
    title: "Bruno Fernandes przedłuża kontrakt z Manchesterem United",
    lead: "Klub potwierdził nową umowę.",
    published_at: "2026-09-28T10:00:00Z",
    categories: { name: "Transfery", slug: "transfery" },
    ...overrides,
  };
}

describe("toArticleCard", () => {
  it("maps the row and builds the canonical link", () => {
    expect(toArticleCard(cardRow())).toEqual({
      id: "article-1",
      slug: "bruno-fernandes-przedluza-kontrakt",
      title: "Bruno Fernandes przedłuża kontrakt z Manchesterem United",
      lead: "Klub potwierdził nową umowę.",
      publishedAt: "2026-09-28T10:00:00Z",
      category: { name: "Transfery", slug: "transfery" },
      href: "/transfery/bruno-fernandes-przedluza-kontrakt",
    });
  });

  it("links an article without a category under the default category", () => {
    const card = toArticleCard(cardRow({ categories: null }));

    expect(card.category).toBeNull();
    expect(card.href).toBe(`/${DEFAULT_CATEGORY_SLUG}/bruno-fernandes-przedluza-kontrakt`);
  });

  it("throws when a published article has no published_at", () => {
    expect(() => toArticleCard(cardRow({ published_at: null }))).toThrow(/published_at/);
  });
});

describe("toPublicCategory", () => {
  it("maps SEO fields to camelCase", () => {
    expect(
      toPublicCategory({
        id: "cat-1",
        name: "Transfery",
        slug: "transfery",
        description: "Opis",
        seo_title: "Transfery piłkarskie",
        seo_description: null,
      }),
    ).toEqual({
      id: "cat-1",
      name: "Transfery",
      slug: "transfery",
      description: "Opis",
      seoTitle: "Transfery piłkarskie",
      seoDescription: null,
    });
  });
});

describe("categoryArticlesFilter", () => {
  it("filters by category id", () => {
    expect(categoryArticlesFilter({ id: "cat-1", slug: "transfery" })).toBe("category_id.eq.cat-1");
  });

  it("includes articles without a category in the default category", () => {
    expect(categoryArticlesFilter({ id: "cat-2", slug: DEFAULT_CATEGORY_SLUG })).toBe(
      "category_id.eq.cat-2,category_id.is.null",
    );
  });
});

describe("categoryPath", () => {
  it("builds the category listing path", () => {
    expect(categoryPath("transfery")).toBe("/transfery");
  });
});
