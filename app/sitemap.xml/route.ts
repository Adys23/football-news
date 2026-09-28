import { connection } from "next/server";
import { siteUrl } from "@/lib/env";
import {
  ABOUT_PATH,
  EDITORIAL_POLICY_PATH,
  articlePath,
  authorPath,
  categoryPath,
  entityPath,
  isValidSlug,
} from "@/lib/public/paths";
import {
  listPublishedAuthors,
  listPublishedEntities,
  type ProfileListing,
} from "@/lib/public/profiles";
import { listSitemapArticles, listSitemapCategorySlugs } from "@/lib/public/sitemap-data";
import { SITEMAP_URL_LIMIT, buildSitemapXml, type SitemapEntry } from "@/lib/public/xml-feeds";

/** Profil ze slugiem, ktorego strona nie przyjmie (404), nie trafia do sitemapy. */
function profileEntry(path: (slug: string) => string) {
  return (profile: ProfileListing): SitemapEntry[] =>
    isValidSlug(profile.slug)
      ? [{ path: path(profile.slug), lastModified: profile.lastModified }]
      : [];
}

/**
 * Sitemapa calego serwisu. Route handler zamiast `sitemap.ts`: Next nie escapuje
 * `<loc>`, a tu jeden builder obsluguje obie sitemapy. connection() przenosi render
 * na zadanie (build nie ma bazy); dane sa w Data Cache pod tagami `articles` i `sitemap`.
 */
export async function GET(): Promise<Response> {
  await connection();

  const [categorySlugs, articles, authors, players, clubs] = await Promise.all([
    listSitemapCategorySlugs(),
    listSitemapArticles(SITEMAP_URL_LIMIT),
    listPublishedAuthors(),
    listPublishedEntities("player"),
    listPublishedEntities("club"),
  ]);

  // Kolejnosc ma znaczenie: przy limicie 50 000 odpadaja wpisy z konca listy.
  const entries: SitemapEntry[] = [
    { path: "/", lastModified: articles[0]?.publishedAt ?? null },
    { path: ABOUT_PATH },
    { path: EDITORIAL_POLICY_PATH },
    ...categorySlugs.map((slug) => ({ path: categoryPath(slug) })),
    ...articles.map((article) => ({
      path: articlePath(article),
      lastModified: article.lastModified,
    })),
    ...authors.flatMap(profileEntry(authorPath)),
    ...players.flatMap(profileEntry((slug) => entityPath("player", slug))),
    ...clubs.flatMap(profileEntry((slug) => entityPath("club", slug))),
  ];

  return new Response(buildSitemapXml(siteUrl(), entries), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
