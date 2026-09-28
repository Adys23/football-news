import "server-only";

import { cache } from "react";
import { CACHE_TAGS } from "@/lib/public/cache-tags";
import {
  ARTICLE_CARD_COLUMNS,
  CATEGORY_COLUMNS,
  categoryArticlesFilter,
  toArticleCard,
  toPublicCategory,
  type ArticleCard,
  type PublicCategory,
} from "@/lib/public/cards";
import { createPublicClient } from "@/lib/public/client";
import { isValidSlug } from "@/lib/public/paths";

/** Tyle artykulow miesci sie na jednej liscie; stronicowanie przyjdzie z archiwum. */
export const LISTING_LIMIT = 30;

/**
 * Nawigacja jest w layoucie kazdej strony publicznej, a Next.js bierze najnizszy
 * `revalidate` na stronie - z 60 s profile (3600 s) odswiezalyby sie co minute.
 * Kategorie zmieniaja sie rzadko, a tag `articles` i tak odswieza je po publikacji.
 */
const NAVIGATION_REVALIDATE_SECONDS = 3600;

/**
 * Najnowsze opublikowane artykuly. Filtr statusu dublujemy mimo RLS
 * (patrz lib/public/queries.ts).
 */
export async function getLatestArticles(limit: number = LISTING_LIMIT): Promise<ArticleCard[]> {
  const supabase = createPublicClient([CACHE_TAGS.articles]);
  const { data, error } = await supabase
    .from("articles")
    .select(ARTICLE_CARD_COLUMNS)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Nie udalo sie odczytac najnowszych artykulow: ${error.message}`);
  }
  return data.map(toArticleCard);
}

/** Kategorie w nawigacji serwisu: tylko glowne, w kolejnosci redakcji. */
export async function getNavigationCategories(): Promise<PublicCategory[]> {
  const supabase = createPublicClient([CACHE_TAGS.articles], NAVIGATION_REVALIDATE_SECONDS);
  const { data, error } = await supabase
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .is("parent_id", null)
    .order("position", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Nie udalo sie odczytac kategorii: ${error.message}`);
  }
  return data.map(toPublicCategory);
}

/** Kategoria po slugu albo null. React cache: generateMetadata i strona dziela zapytanie. */
export const getCategoryBySlug = cache(async (slug: string): Promise<PublicCategory | null> => {
  if (!isValidSlug(slug)) {
    return null;
  }

  const supabase = createPublicClient([CACHE_TAGS.articles, CACHE_TAGS.category(slug)]);
  const { data, error } = await supabase
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Nie udalo sie odczytac kategorii ${slug}: ${error.message}`);
  }
  return data ? toPublicCategory(data) : null;
});

/** Opublikowane artykuly kategorii, od najnowszego. */
export async function getCategoryArticles(
  category: PublicCategory,
  limit: number = LISTING_LIMIT,
): Promise<ArticleCard[]> {
  const supabase = createPublicClient([CACHE_TAGS.articles, CACHE_TAGS.category(category.slug)]);
  const { data, error } = await supabase
    .from("articles")
    .select(ARTICLE_CARD_COLUMNS)
    .eq("status", "published")
    .or(categoryArticlesFilter(category))
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Nie udalo sie odczytac artykulow kategorii ${category.slug}: ${error.message}`);
  }
  return data.map(toArticleCard);
}
