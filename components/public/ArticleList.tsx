import type { ReactNode } from "react";
import { ArticleCard } from "@/components/public/ArticleCard";
import type { ArticleCard as ArticleCardData } from "@/lib/public/cards";

/** Lista kart artykulow z komunikatem, gdy nie ma czego pokazac. */
export function ArticleList({
  articles,
  emptyMessage,
  showCategory = true,
}: {
  articles: readonly ArticleCardData[];
  emptyMessage: ReactNode;
  showCategory?: boolean;
}) {
  if (articles.length === 0) {
    return (
      <p className="mt-8 rounded-md border border-neutral-200 p-6 text-sm text-neutral-600">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="mt-8 divide-y divide-neutral-200">
      {articles.map((article) => (
        <li key={article.id} className="py-6 first:pt-0">
          <ArticleCard article={article} showCategory={showCategory} />
        </li>
      ))}
    </ul>
  );
}
