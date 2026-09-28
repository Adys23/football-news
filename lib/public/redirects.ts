import "server-only";

import { cache } from "react";
import { CACHE_TAGS } from "@/lib/public/cache-tags";
import { createPublicClient } from "@/lib/public/client";
import { redirectPathFromRow } from "@/lib/public/redirect-path";
import { isValidSlug } from "@/lib/public/paths";

/**
 * Aktualna sciezka kanoniczna artykulu, ktory kiedys mial ten slug (article_redirects,
 * migracja 0023), albo null. Wpis wskazuje artykul, wiec sciezka jest zawsze
 * aktualna: kolejne zmiany sluga nie tworza lancucha przekierowan.
 *
 * Tag article:<stary> uniewaznia webhook przy zmianie sluga (previous_slug), a tag
 * articles kazda zmiana opublikowanego artykulu, w tym kolejna zmiana sluga i wycofanie.
 */
export const getArticleRedirectPath = cache(async (oldSlug: string): Promise<string | null> => {
  if (!isValidSlug(oldSlug)) {
    return null;
  }

  const supabase = createPublicClient([CACHE_TAGS.articles, CACHE_TAGS.article(oldSlug)]);
  const { data, error } = await supabase
    .from("article_redirects")
    .select("articles!inner(slug, status, categories(slug))")
    .eq("old_slug", oldSlug)
    .eq("articles.status", "published")
    .maybeSingle();

  if (error) {
    throw new Error(`Nie udalo sie odczytac przekierowania ${oldSlug}: ${error.message}`);
  }

  return data ? redirectPathFromRow(oldSlug, data.articles) : null;
});
