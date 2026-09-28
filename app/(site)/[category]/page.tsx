import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArticleList } from "@/components/public/ArticleList";
import { getCategoryArticles, getCategoryBySlug } from "@/lib/public/listings";
import { categoryPath } from "@/lib/public/paths";

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) {
    return {};
  }

  return {
    title: category.seoTitle ?? category.name,
    description:
      category.seoDescription ??
      category.description ??
      `Najnowsze artykuły z kategorii ${category.name}.`,
    alternates: { canonical: categoryPath(category.slug) },
  };
}

// Render na zadanie jak cala grupa (site); cache danych w lib/public/client.ts.
// Statyczne segmenty pierwszego poziomu maja pierwszenstwo: RESERVED_PATH_SEGMENTS.
export default async function CategoryPage({ params }: CategoryPageProps) {
  await connection();
  const { category: slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) {
    notFound();
  }

  const articles = await getCategoryArticles(category);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight break-words">{category.name}</h1>
      {category.description ? (
        <p className="mt-3 text-neutral-600">{category.description}</p>
      ) : null}
      <ArticleList
        articles={articles}
        showCategory={false}
        emptyMessage="W tej kategorii nie ma jeszcze opublikowanych artykułów."
      />
    </div>
  );
}
