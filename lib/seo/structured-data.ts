import type { PublicArticle } from "@/lib/public/article";
import { articlePath } from "@/lib/public/paths";
import { SITE } from "@/lib/site";

type JsonLdValue =
  string | number | boolean | null | JsonLdValue[] | { [key: string]: JsonLdValue };
export type JsonLd = { [key: string]: JsonLdValue };

/** Adres bezwzgledny wzgledem NEXT_PUBLIC_SITE_URL; adresy juz bezwzgledne zostaja bez zmian. */
export function absoluteUrl(siteUrl: string, path: string): string {
  return new URL(path, siteUrl).toString();
}

export function toIsoString(value: string): string {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    throw new Error(`Niepoprawna data: ${value}`);
  }

  return new Date(time).toISOString();
}

/**
 * Data ostatniej zmiany widocznej dla czytelnika: najpozniejsza z publikacji,
 * edycji artykulu i zatwierdzonych aktualizacji. Nigdy wczesniejsza niz publikacja.
 */
export function articleModifiedAt(
  article: Pick<PublicArticle, "publishedAt" | "updatedAt" | "updates">,
): string {
  const candidates = [
    article.publishedAt,
    article.updatedAt,
    ...article.updates.map((update) => update.publishedAt),
  ].map(toIsoString);

  return candidates.reduce((latest, value) => (value > latest ? value : latest));
}

export function articleCanonicalUrl(
  siteUrl: string,
  article: Pick<PublicArticle, "slug" | "category">,
): string {
  return absoluteUrl(
    siteUrl,
    articlePath({ slug: article.slug, categorySlug: article.category?.slug ?? null }),
  );
}

export function buildNewsArticleJsonLd(article: PublicArticle, siteUrl: string): JsonLd {
  const url = articleCanonicalUrl(siteUrl, article);
  const publisher: JsonLd = {
    "@type": "Organization",
    name: SITE.name,
    url: absoluteUrl(siteUrl, "/"),
  };

  const jsonLd: JsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    datePublished: toIsoString(article.publishedAt),
    dateModified: articleModifiedAt(article),
    inLanguage: SITE.lang,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    isAccessibleForFree: true,
    publisher,
    // Bez przypisanego autora podpisem jest redakcja, czyli wydawca.
    author: article.author ? { "@type": "Person", name: article.author.name } : publisher,
  };

  const description = article.seoDescription ?? article.lead;
  if (description) {
    jsonLd.description = description;
  }
  if (article.category) {
    jsonLd.articleSection = article.category.name;
  }
  if (article.heroImage) {
    jsonLd.image = [
      {
        "@type": "ImageObject",
        url: absoluteUrl(siteUrl, article.heroImage.url),
        width: article.heroImage.width,
        height: article.heroImage.height,
        caption: article.heroImage.alt,
      },
    ];
  }

  return jsonLd;
}

/**
 * Strona glowna -> kategoria -> artykul. Artykul bez kategorii pomija srodkowy
 * poziom: nie ma nazwy do pokazania, a kategoria domyslna w sciezce to tylko prefiks URL.
 */
export function buildBreadcrumbJsonLd(article: PublicArticle, siteUrl: string): JsonLd {
  const items: [string, string][] = [["Strona główna", absoluteUrl(siteUrl, "/")]];
  if (article.category) {
    items.push([article.category.name, absoluteUrl(siteUrl, `/${article.category.slug}`)]);
  }
  items.push([article.title, articleCanonicalUrl(siteUrl, article)]);

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, item], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item,
    })),
  };
}

/**
 * JSON do osadzenia w <script>. Znaki <, >, & i separatory linii zamieniamy na
 * sekwencje \u, zeby tresc z bazy nie mogla zamknac tagu ani wstrzyknac HTML.
 */
export function serializeJsonLd(value: JsonLd): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
