import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { NEWS_SITEMAP_PATH, SITEMAP_PATH } from "@/lib/public/paths";
import { absoluteUrl } from "@/lib/public/xml-feeds";

/** Panel, logowanie i API poza indeksem (docs/architecture.md §8.2). Plik statyczny, bez bazy. */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/login", "/brak-dostepu", "/api"],
    },
    sitemap: [absoluteUrl(base, SITEMAP_PATH), absoluteUrl(base, NEWS_SITEMAP_PATH)],
  };
}
