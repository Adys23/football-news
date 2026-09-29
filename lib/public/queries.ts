import "server-only";

import { cache } from "react";
import {
  IMAGE_ASSET_COLUMNS,
  blockImageIds,
  licensedImage,
  type LicensedImage,
} from "@contracts/index.ts";
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

/**
 * Obrazy z blokow image artykulu: id -> obraz z licencja. Obraz bez licencji, AI albo
 * usuniety nie trafia do mapy, wiec strona publiczna go pomija. Te same tagi co artykul:
 * webhook publikacji odswieza je razem z trescia.
 */
export async function getArticleBlockImages(
  article: Pick<PublicArticle, "slug" | "blocks">,
): Promise<ReadonlyMap<string, LicensedImage>> {
  const ids = blockImageIds(article.blocks);
  if (ids.length === 0) {
    return new Map();
  }

  const supabase = createPublicClient([CACHE_TAGS.articles, CACHE_TAGS.article(article.slug)]);
  const { data, error } = await supabase
    .from("image_assets")
    .select(IMAGE_ASSET_COLUMNS)
    .in("id", ids);

  if (error) {
    throw new Error(`Nie udalo sie odczytac obrazow artykulu ${article.slug}: ${error.message}`);
  }

  return new Map(
    data.flatMap((row) => {
      const image = licensedImage(row);
      return image ? [[image.id, image] as const] : [];
    }),
  );
}
