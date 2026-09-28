import { DEFAULT_CATEGORY_SLUG, articlePath } from "@/lib/public/paths";

/** Kolumny artykulu na listach (strona glowna, kategorie, profile). Jawna lista, bez select *. */
export const ARTICLE_CARD_COLUMNS = "id, slug, title, lead, published_at, categories(name, slug)";

export interface ArticleCardRow {
  id: string;
  slug: string;
  title: string;
  lead: string | null;
  published_at: string | null;
  categories: { name: string; slug: string } | null;
}

/** Artykul w postaci potrzebnej karcie na liscie. */
export interface ArticleCard {
  id: string;
  title: string;
  lead: string | null;
  publishedAt: string;
  category: { name: string; slug: string } | null;
  /** Adres kanoniczny artykulu. */
  href: string;
}

/** Opublikowany artykul zawsze ma published_at (trigger publikacji), wiec brak to usterka danych. */
export function toArticleCard(row: ArticleCardRow): ArticleCard {
  if (!row.published_at) {
    throw new Error(`Opublikowany artykul ${row.id} nie ma published_at`);
  }

  return {
    id: row.id,
    title: row.title,
    lead: row.lead,
    publishedAt: row.published_at,
    category: row.categories,
    href: articlePath({ slug: row.slug, categorySlug: row.categories?.slug ?? null }),
  };
}

export const CATEGORY_COLUMNS = "id, name, slug, description, seo_title, seo_description";

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

export function toPublicCategory(row: CategoryRow): PublicCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
  };
}

/**
 * Filtr PostgREST (`or`) artykulow kategorii. Artykul bez kategorii ma adres
 * pod kategoria domyslna, wiec jej lista musi go tez pokazac.
 */
export function categoryArticlesFilter(category: { id: string; slug: string }): string {
  if (category.slug === DEFAULT_CATEGORY_SLUG) {
    return `category_id.eq.${category.id},category_id.is.null`;
  }
  return `category_id.eq.${category.id}`;
}
