import {
  articleContentSchema,
  licensedImage,
  type ArticleBlock,
  type LicensedImage,
  type Tables,
} from "@contracts/index.ts";
import type { Json } from "@contracts/index.ts";

/** Kolumny artykulu czytane przez strone publiczna. Jawna lista, bez select *. */
export const PUBLISHED_ARTICLE_COLUMNS =
  "id, slug, title, lead, content, seo_title, seo_description, published_at, updated_at, ai_generated, categories(name, slug), authors(name, slug, role_title), article_updates(id, body, published_at, approved_by), hero_image:image_assets!articles_hero_image_id_fkey(id, kind, url, width, height, alt, license, source, photographer, copyright, is_ai_generated)";

/** Wiersz image_assets w kolumnach IMAGE_ASSET_COLUMNS. */
export type ImageAssetRow = Pick<
  Tables<"image_assets">,
  | "id"
  | "kind"
  | "url"
  | "width"
  | "height"
  | "alt"
  | "license"
  | "source"
  | "photographer"
  | "copyright"
  | "is_ai_generated"
>;

export interface PublishedArticleRow {
  id: string;
  slug: string;
  title: string;
  lead: string | null;
  content: Json;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  updated_at: string;
  ai_generated: boolean;
  categories: { name: string; slug: string } | null;
  authors: { name: string; slug: string; role_title: string | null } | null;
  article_updates: {
    id: string;
    body: string;
    published_at: string;
    approved_by: string | null;
  }[];
  hero_image: ImageAssetRow | null;
}

export interface PublicArticleUpdate {
  id: string;
  body: string;
  publishedAt: string;
}

/** Obraz z licencja, nie AI, z podpisem praw (kontrakt image.ts). */
export type PublicImage = LicensedImage;

export interface PublicArticle {
  id: string;
  slug: string;
  title: string;
  lead: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  blocks: ArticleBlock[];
  publishedAt: string;
  updatedAt: string;
  aiGenerated: boolean;
  category: { name: string; slug: string } | null;
  author: { name: string; slug: string; roleTitle: string | null } | null;
  /** Od najnowszej. */
  updates: PublicArticleUpdate[];
  /** Tylko obraz z licencja, nie AI (AGENTS.md §4.9); inaczej null. */
  heroImage: PublicImage | null;
}

/**
 * Tresc byla walidowana przed zapisem, wiec blad schematu na opublikowanym
 * artykule to usterka danych: rzucamy, zamiast po cichu pokazac pusty tekst.
 */
export function toPublicArticle(row: PublishedArticleRow): PublicArticle {
  const content = articleContentSchema.safeParse(row.content);
  if (!content.success) {
    throw new Error(`Opublikowany artykul ${row.id} ma tresc niezgodna ze schematem`);
  }
  if (!row.published_at) {
    throw new Error(`Opublikowany artykul ${row.id} nie ma published_at`);
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    lead: row.lead,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    blocks: content.data.blocks,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    aiGenerated: row.ai_generated,
    category: row.categories,
    author: row.authors
      ? { name: row.authors.name, slug: row.authors.slug, roleTitle: row.authors.role_title }
      : null,
    // RLS od 0026 ukrywa aktualizacje bez akceptacji; filtr zostaje jako druga warstwa.
    updates: row.article_updates
      .filter((update) => update.approved_by !== null)
      .map((update) => ({ id: update.id, body: update.body, publishedAt: update.published_at }))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    heroImage: licensedImage(row.hero_image),
  };
}
