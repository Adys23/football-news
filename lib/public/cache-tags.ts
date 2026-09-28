/**
 * Tagi cache strony publicznej. Te same nazwy uniewaznia /api/revalidate
 * po publikacji (docs/architecture.md §7), wiec zmiana nazwy tutaj wymaga
 * zmiany po stronie webhooka.
 */
export const CACHE_TAGS = {
  articles: "articles",
  sitemap: "sitemap",
  article: (slug: string) => `article:${slug}`,
  category: (slug: string) => `category:${slug}`,
} as const;

/**
 * Siatka bezpieczenstwa do czasu webhooka publikacji: bez niej pusty wynik
 * zapytania o jeszcze nieopublikowany slug zostalby w cache na zawsze.
 */
export const PUBLIC_REVALIDATE_SECONDS = 60;
