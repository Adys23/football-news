import type { Metadata } from "next";
import { ArticleList } from "@/components/public/ArticleList";
import { getLatestArticles } from "@/lib/public/listings";
import { SITE } from "@/lib/site";

// Musi byc literalem (analiza statyczna Next.js); ta sama wartosc co PUBLIC_REVALIDATE_SECONDS.
export const revalidate = 60;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const articles = await getLatestArticles();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">{SITE.name}</h1>
      <p className="mt-3 text-neutral-600">{SITE.description}</p>

      <section aria-labelledby="najnowsze" className="mt-10">
        <h2
          id="najnowsze"
          className="text-sm font-semibold tracking-wide text-neutral-500 uppercase"
        >
          Najnowsze
        </h2>
        <ArticleList articles={articles} emptyMessage="Nie ma jeszcze opublikowanych artykułów." />
      </section>
    </div>
  );
}
