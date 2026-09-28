import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { BlockRenderer } from "@/components/article/BlockRenderer";
import { AiDisclosure } from "@/components/public/AiDisclosure";
import { ArticleUpdates } from "@/components/public/ArticleUpdates";
import { siteUrl } from "@/lib/env";
import { formatPublicDateTime } from "@/lib/public/format";
import { articlePath } from "@/lib/public/paths";
import { getPublishedArticle } from "@/lib/public/queries";
import { buildArticleMetadata } from "@/lib/seo/metadata";
import {
  buildBreadcrumbJsonLd,
  buildNewsArticleJsonLd,
  serializeJsonLd,
} from "@/lib/seo/structured-data";

// Musi byc literalem (analiza statyczna Next.js); ta sama wartosc co PUBLIC_REVALIDATE_SECONDS.
export const revalidate = 60;

// Pusta lista wlacza ISR na zadanie: build nie potrzebuje bazy, strony powstaja przy pierwszej wizycie.
export function generateStaticParams(): { category: string; slug: string }[] {
  return [];
}

interface ArticlePageProps {
  params: Promise<{ category: string; slug: string }>;
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticle(slug);
  if (!article) {
    return {};
  }

  return buildArticleMetadata(article, siteUrl());
}

// Tresci faktow nie sa jeszcze czytelne dla anona (plan etapu 4, PR 4.2a), wiec fact_box sie nie pokaze.
const NO_FACTS: ReadonlyMap<string, string> = new Map();

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { category, slug } = await params;
  const article = await getPublishedArticle(slug);
  if (!article) {
    notFound();
  }

  const canonicalPath = articlePath({
    slug: article.slug,
    categorySlug: article.category?.slug ?? null,
  });
  if (canonicalPath !== `/${category}/${slug}`) {
    permanentRedirect(canonicalPath);
  }

  const baseUrl = siteUrl();
  const structuredData = [
    buildNewsArticleJsonLd(article, baseUrl),
    buildBreadcrumbJsonLd(article, baseUrl),
  ];

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      {structuredData.map((jsonLd) => (
        <script
          key={String(jsonLd["@type"])}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      ))}
      <header>
        {article.category ? (
          <p className="text-sm font-medium tracking-wide text-sky-700 uppercase">
            {article.category.name}
          </p>
        ) : null}
        <h1 className="mt-2 text-3xl font-bold tracking-tight break-words sm:text-4xl">
          {article.title}
        </h1>
        {article.lead ? (
          <p className="mt-4 text-lg leading-relaxed text-neutral-700">{article.lead}</p>
        ) : null}
        <p className="mt-4 text-sm text-neutral-600">
          {article.author ? (
            <>
              <span className="font-medium text-neutral-900">{article.author.name}</span>
              {article.author.roleTitle ? `, ${article.author.roleTitle}` : null}
              {" · "}
            </>
          ) : null}
          <time dateTime={article.publishedAt}>{formatPublicDateTime(article.publishedAt)}</time>
        </p>
      </header>

      <ArticleUpdates updates={article.updates} />

      <div className="mt-8 text-lg break-words">
        <BlockRenderer blocks={article.blocks} factStatements={NO_FACTS} variant="public" />
      </div>

      <AiDisclosure aiGenerated={article.aiGenerated} />
    </article>
  );
}
