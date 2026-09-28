import type { PublicArticleUpdate } from "@/lib/public/article";
import { formatPublicDateTime } from "@/lib/public/format";

/** Aktualizacje historii zamiast drugiego tekstu o tym samym (AGENTS.md §4.7). */
export function ArticleUpdates({ updates }: { updates: readonly PublicArticleUpdate[] }) {
  if (updates.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="aktualizacje" className="mt-8 border-l-4 border-sky-600 pl-4">
      <h2 id="aktualizacje" className="text-lg font-semibold">
        Aktualizacje
      </h2>
      <ol className="mt-3 space-y-4">
        {updates.map((update) => (
          <li key={update.id}>
            <p className="text-sm font-medium text-neutral-600">
              <time dateTime={update.publishedAt}>{formatPublicDateTime(update.publishedAt)}</time>
            </p>
            <p className="mt-1 leading-relaxed break-words">{update.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
