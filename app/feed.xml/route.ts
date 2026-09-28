import { connection } from "next/server";
import { siteUrl } from "@/lib/env";
import { getLatestArticles } from "@/lib/public/listings";
import { FEED_PATH } from "@/lib/public/paths";
import { FEED_ITEM_LIMIT, buildRssXml } from "@/lib/public/xml-feeds";
import { SITE } from "@/lib/site";

/**
 * Feed RSS 2.0 portalu. Adres poza /api, bo robots.txt blokuje /api. Render na zadanie
 * (build nie ma bazy), dane w Data Cache pod tagiem `articles` z webhooka publikacji.
 */
export async function GET(): Promise<Response> {
  await connection();

  const articles = await getLatestArticles(FEED_ITEM_LIMIT);
  const xml = buildRssXml(
    siteUrl(),
    {
      title: SITE.name,
      description: SITE.description,
      language: SITE.lang,
      feedPath: FEED_PATH,
    },
    articles.map((article) => ({
      id: article.id,
      title: article.title,
      path: article.href,
      publishedAt: article.publishedAt,
      description: article.lead,
      category: article.category?.name ?? null,
    })),
  );

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
