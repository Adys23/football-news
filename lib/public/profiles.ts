import "server-only";

import { cache } from "react";
import { CACHE_TAGS } from "@/lib/public/cache-tags";
import { ARTICLE_CARD_COLUMNS, toArticleCard, type ArticleCard } from "@/lib/public/cards";
import { createPublicClient } from "@/lib/public/client";
import { LISTING_LIMIT } from "@/lib/public/listings";
import { isValidSlug, type ProfileEntityType } from "@/lib/public/paths";
import {
  AUTHOR_COLUMNS,
  CLUB_COLUMNS,
  PLAYER_COLUMNS,
  chunk,
  latestArticleByEntity,
  toPublicAuthor,
  toPublicClub,
  toPublicPlayer,
  type PublicAuthor,
  type PublicClub,
  type PublicPlayer,
} from "@/lib/public/profiles-model";

/**
 * Profile publikacji sie zmieniaja tylko razem z artykulami, wiec wszystkie
 * zapytania tej strony uniewaznia tag `articles` (webhook publikacji).
 */
const TAGS = [CACHE_TAGS.articles] as const;

/** Profile odswiezaja sie co godzine (docs/architecture.md §7); ta sama wartosc co `revalidate` stron. */
export const PROFILE_REVALIDATE_SECONDS = 3600;

function profileClient(tags: readonly string[] = TAGS) {
  return createPublicClient(tags, PROFILE_REVALIDATE_SECONDS);
}

/** Tyle zawodnikow klubu pokazujemy na jego profilu. */
const CLUB_PLAYERS_LIMIT = 60;

/** Limit wierszy PostgREST (supabase/config.toml, max_rows). */
const PAGE_SIZE = 1000;

/** Identyfikatory w jednym filtrze `in()` - trzyma adres zapytania w rozsadnej dlugosci. */
const IN_FILTER_CHUNK = 100;

function readError(what: string, error: { message: string }): Error {
  return new Error(`Nie udalo sie odczytac: ${what}: ${error.message}`);
}

/** Zawodnik po slugu albo null. React cache: generateMetadata i strona dziela zapytanie. */
export const getPlayerBySlug = cache(async (slug: string): Promise<PublicPlayer | null> => {
  if (!isValidSlug(slug)) {
    return null;
  }
  const { data, error } = await profileClient()
    .from("players")
    .select(PLAYER_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw readError(`zawodnik ${slug}`, error);
  }
  return data ? toPublicPlayer(data) : null;
});

/** Klub po slugu albo null. */
export const getClubBySlug = cache(async (slug: string): Promise<PublicClub | null> => {
  if (!isValidSlug(slug)) {
    return null;
  }
  const { data, error } = await profileClient()
    .from("clubs")
    .select(CLUB_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw readError(`klub ${slug}`, error);
  }
  return data ? toPublicClub(data) : null;
});

/** Aktywny autor po slugu albo null. Nieaktywnych autorow RLS nie pokazuje. */
export const getAuthorBySlug = cache(async (slug: string): Promise<PublicAuthor | null> => {
  if (!isValidSlug(slug)) {
    return null;
  }
  const { data, error } = await profileClient()
    .from("authors")
    .select(AUTHOR_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw readError(`autor ${slug}`, error);
  }
  return data ? toPublicAuthor(data) : null;
});

/**
 * Opublikowane artykuly powiazane z encja przez `article_entities`, od najnowszego.
 * Filtr statusu dublujemy mimo RLS (patrz lib/public/queries.ts).
 */
export const getEntityArticles = cache(
  async (entityType: ProfileEntityType, entityId: string): Promise<ArticleCard[]> => {
    const { data, error } = await profileClient()
      .from("articles")
      .select(`${ARTICLE_CARD_COLUMNS}, article_entities!inner(entity_type, entity_id)`)
      .eq("status", "published")
      .eq("article_entities.entity_type", entityType)
      .eq("article_entities.entity_id", entityId)
      .order("published_at", { ascending: false })
      .limit(LISTING_LIMIT);

    if (error) {
      throw readError(`artykuly encji ${entityType} ${entityId}`, error);
    }
    return data.map(toArticleCard);
  },
);

/** Opublikowane artykuly autora, od najnowszego. */
export const getAuthorArticles = cache(async (authorId: string): Promise<ArticleCard[]> => {
  const { data, error } = await profileClient()
    .from("articles")
    .select(ARTICLE_CARD_COLUMNS)
    .eq("status", "published")
    .eq("author_id", authorId)
    .order("published_at", { ascending: false })
    .limit(LISTING_LIMIT);

  if (error) {
    throw readError(`artykuly autora ${authorId}`, error);
  }
  return data.map(toArticleCard);
});

/** Obecni zawodnicy klubu, alfabetycznie. */
export async function getClubPlayers(
  clubId: string,
): Promise<{ id: string; name: string; slug: string; position: string | null }[]> {
  const { data, error } = await profileClient()
    .from("players")
    .select("id, name, slug, position")
    .eq("current_club_id", clubId)
    .order("name", { ascending: true })
    .limit(CLUB_PLAYERS_LIMIT);

  if (error) {
    throw readError(`zawodnicy klubu ${clubId}`, error);
  }
  return data;
}

/** Strona z adresem i data ostatniej zmiany - wejscie dla sitemapy. */
export interface ProfileListing {
  slug: string;
  /** published_at najnowszego powiazanego artykulu (ISO). */
  lastModified: string;
}

/**
 * Zawodnicy albo kluby z co najmniej jednym opublikowanym artykulem. Tylko takie
 * profile sa indeksowane; reszta ma `noindex` (docs/architecture.md §8.3).
 */
export async function listPublishedEntities(
  entityType: ProfileEntityType,
): Promise<ProfileListing[]> {
  const supabase = profileClient([...TAGS, CACHE_TAGS.sitemap]);
  const links: { entity_id: string; articles: { published_at: string | null } | null }[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("article_entities")
      .select("entity_id, articles!inner(published_at)")
      .eq("entity_type", entityType)
      .eq("articles.status", "published")
      .order("article_id", { ascending: true })
      .order("entity_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw readError(`powiazania encji ${entityType}`, error);
    }
    links.push(...data);
    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  const latest = latestArticleByEntity(links);
  const table = entityType === "player" ? "players" : "clubs";
  const result: ProfileListing[] = [];

  for (const ids of chunk([...latest.keys()], IN_FILTER_CHUNK)) {
    const { data, error } = await supabase.from(table).select("id, slug").in("id", ids);
    if (error) {
      throw readError(`profile ${table}`, error);
    }
    for (const row of data) {
      const lastModified = latest.get(row.id);
      if (lastModified) {
        result.push({ slug: row.slug, lastModified });
      }
    }
  }

  return result.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Aktywni autorzy z co najmniej jednym opublikowanym artykulem. */
export async function listPublishedAuthors(): Promise<ProfileListing[]> {
  const supabase = profileClient([...TAGS, CACHE_TAGS.sitemap]);
  const result: ProfileListing[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("authors")
      .select("slug, articles!inner(published_at)")
      .eq("articles.status", "published")
      .order("published_at", { referencedTable: "articles", ascending: false })
      .limit(1, { referencedTable: "articles" })
      .order("slug", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw readError("autorzy", error);
    }
    for (const row of data) {
      const lastModified = row.articles[0]?.published_at;
      if (lastModified) {
        result.push({ slug: row.slug, lastModified });
      }
    }
    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  return result;
}
