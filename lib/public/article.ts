import { articleContentSchema, type ArticleBlock } from "@contracts/index.ts";
import type { Json } from "@contracts/index.ts";

/** Kolumny artykulu czytane przez strone publiczna. Jawna lista, bez select *. */
export const PUBLISHED_ARTICLE_COLUMNS =
  "id, slug, title, lead, content, published_at, ai_generated, categories(name, slug), authors(name, slug, role_title), article_updates(id, body, published_at, approved_by)";

export interface PublishedArticleRow {
  id: string;
  slug: string;
  title: string;
  lead: string | null;
  content: Json;
  published_at: string | null;
  ai_generated: boolean;
  categories: { name: string; slug: string } | null;
  authors: { name: string; slug: string; role_title: string | null } | null;
  article_updates: {
    id: string;
    body: string;
    published_at: string;
    approved_by: string | null;
  }[];
}

export interface PublicArticleUpdate {
  id: string;
  body: string;
  publishedAt: string;
}

export interface PublicArticle {
  id: string;
  slug: string;
  title: string;
  lead: string | null;
  blocks: ArticleBlock[];
  publishedAt: string;
  aiGenerated: boolean;
  category: { name: string; slug: string } | null;
  author: { name: string; slug: string; roleTitle: string | null } | null;
  /** Od najnowszej. */
  updates: PublicArticleUpdate[];
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
    blocks: content.data.blocks,
    publishedAt: row.published_at,
    aiGenerated: row.ai_generated,
    category: row.categories,
    author: row.authors
      ? { name: row.authors.name, slug: row.authors.slug, roleTitle: row.authors.role_title }
      : null,
    // RLS pokazuje aktualizacje kazdego opublikowanego artykulu, takze te bez akceptacji.
    updates: row.article_updates
      .filter((update) => update.approved_by !== null)
      .map((update) => ({ id: update.id, body: update.body, publishedAt: update.published_at }))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
  };
}
