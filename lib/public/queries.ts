import "server-only";

import { cache } from "react";
import {
  PUBLISHED_ARTICLE_COLUMNS,
  toPublicArticle,
  type PublicArticle,
} from "@/lib/public/article";
import { CACHE_TAGS } from "@/lib/public/cache-tags";
import { createPublicClient } from "@/lib/public/client";
import { isValidSlug } from "@/lib/public/paths";

/**
 * Opublikowany artykul po slugu albo null. Filtr statusu dublujemy mimo RLS:
 * polityka redaktora pokazuje wszystko, wiec nie polegamy na tym, kim jest klient.
 * React cache: generateMetadata i strona dziela jedno zapytanie na render.
 */
export const getPublishedArticle = cache(async (slug: string): Promise<PublicArticle | null> => {
  if (!isValidSlug(slug)) {
    return null;
  }

  const supabase = createPublicClient([CACHE_TAGS.articles, CACHE_TAGS.article(slug)]);
  const { data, error } = await supabase
    .from("articles")
    .select(PUBLISHED_ARTICLE_COLUMNS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    throw new Error(`Nie udalo sie odczytac artykulu ${slug}: ${error.message}`);
  }

  return data ? toPublicArticle(data) : null;
});
