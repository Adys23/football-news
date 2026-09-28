import type { Database } from "../contracts/database.types.ts";

type ArticleStatus = Database["public"]["Enums"]["article_status"];

/** Klucz joba odswiezenia po edycji redaktora - ten sam, ktorego uzywa enqueue_seo_refresh (0025). */
export function seoRefreshDedupeKey(articleId: string): string {
  return `GENERATE_SEO:refresh:${articleId}`;
}

/** Statusy, w ktorych redaktor mogl poprawic tytul lub lead, a artykul nie jest jeszcze publiczny. */
export const SEO_REFRESH_STATUSES: readonly ArticleStatus[] = ["review", "approved"];

export type SeoJobMode = "draft" | "refresh" | "skip";

/**
 * Tryb GENERATE_SEO: szkic dostaje pelne metadane ze slugiem, artykul w recenzji z pustym
 * SEO (po edycji tytulu lub leadu) tylko seo_title i seo_description. Opublikowanego
 * albo juz uzupelnionego artykulu job nie rusza.
 */
export function seoJobMode(article: {
  status: ArticleStatus;
  seo_title: string | null;
  seo_description: string | null;
}): SeoJobMode {
  if (article.status === "draft") {
    return "draft";
  }

  const seoMissing = article.seo_title === null || article.seo_description === null;
  if (seoMissing && SEO_REFRESH_STATUSES.includes(article.status)) {
    return "refresh";
  }

  return "skip";
}
