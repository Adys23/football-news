import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleList } from "@/components/public/ArticleList";
import { authorPath } from "@/lib/public/paths";
import { getAuthorArticles, getAuthorBySlug } from "@/lib/public/profiles";

// Musi byc literalem (analiza statyczna Next.js); jak profile w docs/architecture.md §7.
export const revalidate = 3600;

// Pusta lista: strony powstaja na zadanie, build nie czyta bazy.
export function generateStaticParams(): { slug: string }[] {
  return [];
}

interface AuthorPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const { slug } = await params;
  const author = await getAuthorBySlug(slug);
  if (!author) {
    return {};
  }
  const articles = await getAuthorArticles(author.id);

  return {
    title: author.name,
    description:
      author.bio ??
      `${author.name}${author.roleTitle ? `, ${author.roleTitle}` : ""} - artykuły autora.`,
    alternates: { canonical: authorPath(author.slug) },
    // Jak profile encji: bez artykulow strona nie trafia do indeksu ani do sitemapy.
    ...(articles.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function AuthorPage({ params }: AuthorPageProps) {
  const { slug } = await params;
  const author = await getAuthorBySlug(slug);
  if (!author) {
    notFound();
  }

  const articles = await getAuthorArticles(author.id);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm font-medium tracking-wide text-sky-700 uppercase">Autor</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight break-words">{author.name}</h1>
      {author.roleTitle ? <p className="mt-1 text-neutral-600">{author.roleTitle}</p> : null}
      {author.bio ? (
        <p className="mt-4 leading-relaxed break-words text-neutral-700">{author.bio}</p>
      ) : null}
      {author.xUrl ? (
        <p className="mt-4 text-sm">
          <a href={author.xUrl} rel="me noopener noreferrer" className="underline">
            Profil w serwisie X
          </a>
        </p>
      ) : null}

      <section aria-labelledby="artykuly-autora" className="mt-10">
        <h2
          id="artykuly-autora"
          className="text-sm font-semibold tracking-wide text-neutral-500 uppercase"
        >
          Artykuły
        </h2>
        <ArticleList
          articles={articles}
          emptyMessage="Autor nie ma jeszcze opublikowanych artykułów."
        />
      </section>
    </div>
  );
}
