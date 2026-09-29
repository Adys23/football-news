import Link from "next/link";
import { formatNewsroomTime } from "@/lib/admin/labels";
import type { RejectionItem } from "@/lib/admin/quality";

export function RejectionList({ items, total }: { items: RejectionItem[]; total: number }) {
  if (items.length === 0) {
    return <p className="mt-4 text-sm text-neutral-600">Brak odrzuceń w tym oknie.</p>;
  }

  return (
    <>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.articleId} className="rounded-md border border-neutral-200 p-4 text-sm">
            <p className="font-medium">
              <Link href={`/admin/artykuly/${item.articleId}`} className="underline">
                {item.title}
              </Link>
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {item.categoryName} · {formatNewsroomTime(item.rejectedAt)}
            </p>
            <p className="mt-2">
              {item.reason ?? <span className="text-neutral-500">Bez podanego powodu</span>}
            </p>
          </li>
        ))}
      </ul>
      {total > items.length ? (
        <p className="mt-3 text-xs text-neutral-500">
          Pokazano {items.length} najnowszych z {total}.
        </p>
      ) : null}
    </>
  );
}
