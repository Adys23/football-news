import { connection } from "next/server";
import { siteUrl } from "@/lib/env";
import { articlePath } from "@/lib/public/paths";
import { listNewsSitemapCandidates } from "@/lib/public/sitemap-data";
import { buildNewsSitemapXml, selectNewsArticles } from "@/lib/public/xml-feeds";
import { SITE } from "@/lib/site";

/**
 * Sitemapa Google News: artykuly z ostatnich 48 godzin (docs/architecture.md §8.2).
 * Route handler, bo metadata route `sitemap.ts` nie obsluguje namespace `news:`.
 * connection() przenosi render na zadanie - build nie ma bazy.
 */
export async function GET(): Promise<Response> {
  await connection();

  const now = new Date();
  const candidates = await listNewsSitemapCandidates(now);
  const articles = selectNewsArticles(
    candidates.map((article) => ({
      path: articlePath(article),
      title: article.title,
      publishedAt: article.publishedAt,
    })),
    now,
  );

  const xml = buildNewsSitemapXml(siteUrl(), { name: SITE.name, language: SITE.lang }, articles);
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
