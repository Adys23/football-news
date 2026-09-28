import { formatScore } from "@/lib/admin/labels";

export function ScoreBadge({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border border-neutral-200 p-3">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{formatScore(value)}</dd>
    </div>
  );
}
