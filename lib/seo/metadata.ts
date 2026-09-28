import type { Metadata } from "next";
import type { PublicArticle } from "@/lib/public/article";
import {
  absoluteUrl,
  articleCanonicalUrl,
  articleModifiedAt,
  toIsoString,
} from "@/lib/seo/structured-data";
import { SITE } from "@/lib/site";

/**
 * Metadane artykulu (docs/architecture.md §8.1). Wszystkie adresy bezwzgledne,
 * zeby nie zalezaly od metadataBase ustawionego w layoucie.
 */
export function buildArticleMetadata(article: PublicArticle, siteUrl: string): Metadata {
  const url = articleCanonicalUrl(siteUrl, article);
  const title = article.seoTitle ?? article.title;
  const description = article.seoDescription ?? article.lead ?? undefined;
  const images = article.heroImage
    ? [
        {
          url: absoluteUrl(siteUrl, article.heroImage.url),
          width: article.heroImage.width,
          height: article.heroImage.height,
          alt: article.heroImage.alt,
        },
      ]
    : undefined;

  return {
    // seo_title (do 70 znakow) jest pelnym tytulem strony, wiec bez szablonu z layoutu.
    title: article.seoTitle ? { absolute: article.seoTitle } : article.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      siteName: SITE.name,
      locale: SITE.locale,
      publishedTime: toIsoString(article.publishedAt),
      modifiedTime: articleModifiedAt(article),
      section: article.category?.name,
      authors: article.author ? [article.author.name] : undefined,
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      images,
    },
    // Zagniezdzone pola z layoutu sa nadpisywane w calosci, wiec powtarzamy robots.
    robots: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
      },
    },
  };
}
