import { SOURCE_TYPE_LABELS, formatNewsroomTime, formatScore } from "@/lib/admin/labels";
import { safeHttpUrl, type ReviewSource } from "@/lib/admin/review";

export function SourceList({ sources }: { sources: ReviewSource[] }) {
  if (sources.length === 0) {
    return <p className="mt-4 text-sm text-neutral-600">Brak źródeł przypisanych do historii.</p>;
  }

  return (
    <ul className="mt-4 space-y-3">
      {sources.map((source) => {
        const href = safeHttpUrl(source.url);
        return (
          <li key={source.sourceItemId} className="rounded-md border border-neutral-200 p-3">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium break-words underline"
              >
                {source.title}
              </a>
            ) : (
              <p className="font-medium break-words">{source.title}</p>
            )}
            <p className="mt-1 text-xs text-neutral-500">
              {source.sourceName} · {SOURCE_TYPE_LABELS[source.sourceType]} · zaufanie{" "}
              {formatScore(source.trustScore)}
              {source.publishedAt ? ` · ${formatNewsroomTime(source.publishedAt)}` : ""}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
