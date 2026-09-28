import type { ReviewQueueItem } from "@/lib/admin/dashboard";
import {
  PUBLISHABILITY_LABELS,
  eventTypeLabel,
  formatNewsroomTime,
  formatScore,
} from "@/lib/admin/labels";

export function ReviewQueue({ items, total }: { items: ReviewQueueItem[]; total: number }) {
  if (items.length === 0) {
    return <p className="mt-4 text-sm text-neutral-600">Brak artykułów do weryfikacji.</p>;
  }

  return (
    <>
      {total > items.length ? (
        <p className="mt-4 text-sm text-amber-800">
          Pokazano {items.length} z {total} artykułów, najważniejsze według wagi.
        </p>
      ) : null}
      <ol className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.articleId} className="rounded-md border border-neutral-200 p-4">
            <p className="font-medium">{item.title}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {eventTypeLabel(item.eventType)} · waga {item.importance} · pewność{" "}
              {formatScore(item.confidence)}
              {item.publishability ? ` · ${PUBLISHABILITY_LABELS[item.publishability]}` : ""}
              {item.conflicts > 0 ? ` · konflikty: ${item.conflicts}` : ""}
            </p>
            {item.unsupportedClaims ? (
              <p className="mt-1 text-xs font-medium text-red-700">
                Twierdzenia bez podparcia w faktach: {item.unsupportedClaims}. Publikacja
                zablokowana.
              </p>
            ) : null}
            <p className="mt-1 text-xs text-neutral-500">
              jakość {formatScore(item.quality)} · clickbait {formatScore(item.clickbait)} · w
              kolejce od {formatNewsroomTime(item.createdAt)}
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}
