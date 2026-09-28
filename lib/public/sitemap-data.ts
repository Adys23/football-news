import "server-only";

import { CACHE_TAGS } from "@/lib/public/cache-tags";
import { createPublicClient } from "@/lib/public/client";
import { isReservedPathSegment, isValidSlug } from "@/lib/public/paths";
import { latestDate, newsQueryCutoff, NEWS_SITEMAP_URL_LIMIT } from "@/lib/public/xml-feeds";

/**
 * Zapytania sitemap. Tag `sitemap` uniewaznia webhook publikacji razem z `articles`
 * (docs/architecture.md §7); `revalidate = 60` zostaje jako siatka bezpieczenstwa.
 */
const TAGS = [CACHE_TAGS.articles, CACHE_TAGS.sitemap] as const;

/** Limit wierszy PostgREST (supabase/config.toml, max_rows). */
const PAGE_SIZE = 1000;

function readError(what: string, error: { message: string }): Error {
  return new Error(`Nie udalo sie odczytac: ${what}: ${error.message}`);
}

export interface SitemapArticle {
  slug: string;
  categorySlug: string | null;
  title: string;
  publishedAt: string;
  /** Pozniejsza z dat publikacji i ostatniej zmiany. */
  lastModified: string;
}

interface SitemapArticleRow {
  id: string;
  slug: string;
  title: string;
  published_at: string | null;
  updated_at: string;
  categories: { slug: string } | null;
}

const SITEMAP_ARTICLE_COLUMNS = "id, slug, title, published_at, updated_at, categories(slug)";

/** Artykul trafia do sitemapy tylko wtedy, gdy jego adres nie konczy sie 404. */
function toSitemapArticle(row: SitemapArticleRow): SitemapArticle | null {
  const categorySlug = row.categories?.slug ?? null;
  if (!row.published_at || !isValidSlug(row.slug)) return null;
  if (categorySlug !== null && (!isValidSlug(categorySlug) || isReservedPathSegment(categorySlug))) {
    return null;
  }
  return {
    slug: row.slug,
    categorySlug,
    title: row.title,
    publishedAt: row.published_at,
    lastModified: latestDate(row.published_at, row.updated_at),
  };
}

/**
 * Opublikowane artykuly od najnowszego, stronami po 1000 wierszy, najwyzej `maxRows`.
 * Filtr statusu dublujemy mimo RLS (patrz lib/public/queries.ts).
 */
export async function listSitemapArticles(maxRows: number): Promise<SitemapArticle[]> {
  const supabase = createPublicClient(TAGS);
  const result: SitemapArticle[] = [];

  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, maxRows) - 1;
    const { data, error } = await supabase
      .from("articles")
      .select(SITEMAP_ARTICLE_COLUMNS)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) {
      throw readError("artykuly do sitemapy", error);
    }
    for (const row of data) {
      const article = toSitemapArticle(row);
      if (article) result.push(article);
    }
    if (data.length < to - from + 1) {
      break;
    }
  }

  return result;
}

/**
 * Kandydaci do sitemapy newsowej: od pelnej godziny sprzed 48 h, najwyzej 1000.
 * Dokladne okno 48 h liczy selectNewsArticles, bo zapytanie ma stabilny klucz cache.
 */
export async function listNewsSitemapCandidates(now: Date): Promise<SitemapArticle[]> {
  const { data, error } = await createPublicClient(TAGS)
    .from("articles")
    .select(SITEMAP_ARTICLE_COLUMNS)
    .eq("status", "published")
    .gte("published_at", newsQueryCutoff(now).toISOString())
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(NEWS_SITEMAP_URL_LIMIT);

  if (error) {
    throw readError("artykuly do sitemapy newsowej", error);
  }
  return data.flatMap((row) => toSitemapArticle(row) ?? []);
}

/** Slugi wszystkich kategorii z wlasna strona, w kolejnosci redakcji. */
export async function listSitemapCategorySlugs(): Promise<string[]> {
  const { data, error } = await createPublicClient(TAGS)
    .from("categories")
    .select("slug")
    .order("position", { ascending: true })
    .order("name", { ascending: true })
    .limit(PAGE_SIZE);

  if (error) {
    throw readError("kategorie do sitemapy", error);
  }
  return data
    .map((row) => row.slug)
    .filter((slug) => isValidSlug(slug) && !isReservedPathSegment(slug));
}
