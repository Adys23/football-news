import { formatScore } from "@/lib/admin/labels";
import type { FactVerdict, ReviewFact } from "@/lib/admin/review";

const VERDICTS: Record<FactVerdict, { label: string; className: string }> = {
  approved: { label: "zatwierdzony", className: "text-green-700" },
  rejected: { label: "odrzucony", className: "text-neutral-500" },
  unassessed: { label: "bez oceny", className: "text-amber-700" },
};

export function FactTable({ facts }: { facts: ReviewFact[] }) {
  if (facts.length === 0) {
    return <p className="mt-4 text-sm text-neutral-600">Brak faktów dla tej historii.</p>;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-neutral-500">
          <tr>
            <th className="py-2 pr-4 font-normal">Fakt</th>
            <th className="py-2 pr-4 font-normal">Pewność</th>
            <th className="py-2 pr-4 font-normal">Źródła</th>
            <th className="py-2 font-normal">Do tekstu</th>
          </tr>
        </thead>
        <tbody>
          {facts.map((fact) => (
            <tr key={fact.id} className="border-t border-neutral-200 align-top">
              <td className="py-2 pr-4">{fact.statement}</td>
              <td className="py-2 pr-4">{formatScore(fact.confidence)}</td>
              <td className="py-2 pr-4 text-neutral-600">
                {fact.sourceNames.length > 0 ? fact.sourceNames.join(", ") : "—"}
              </td>
              <td className={`py-2 ${VERDICTS[fact.verdict].className}`}>
                {VERDICTS[fact.verdict].label}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
