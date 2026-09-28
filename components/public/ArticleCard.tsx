import Link from "next/link";
import type { ArticleCard as ArticleCardData } from "@/lib/public/cards";
import { formatPublicDateTime } from "@/lib/public/format";
import { categoryPath } from "@/lib/public/paths";

/** Karta artykulu na liscie. `showCategory` wylaczamy na stronie samej kategorii. */
export function ArticleCard({
  article,
  showCategory = true,
}: {
  article: ArticleCardData;
  showCategory?: boolean;
}) {
  return (
    <article>
      <p className="text-sm text-neutral-600">
        {showCategory && article.category ? (
          <>
            <Link
              href={categoryPath(article.category.slug)}
              className="font-medium tracking-wide text-sky-700 uppercase hover:underline"
            >
              {article.category.name}
            </Link>
            {" · "}
          </>
        ) : null}
        <time dateTime={article.publishedAt}>{formatPublicDateTime(article.publishedAt)}</time>
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight break-words">
        <Link href={article.href} className="hover:underline">
          {article.title}
        </Link>
      </h2>
      {article.lead ? (
        <p className="mt-2 leading-relaxed break-words text-neutral-700">{article.lead}</p>
      ) : null}
    </article>
  );
}
