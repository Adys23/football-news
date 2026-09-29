import type { ReactNode } from "react";
import { formatScore } from "@/lib/admin/labels";
import {
  formatShare,
  formatUsd,
  type CategoryReport,
  type QualitySummary,
} from "@/lib/admin/quality";

interface Row {
  key: string;
  name: string;
  summary: QualitySummary;
}

function rowsOf(categories: CategoryReport[], overall: QualitySummary): Row[] {
  return [
    ...categories.map((category) => ({
      key: category.categoryId ?? "none",
      name: category.name,
      summary: category.summary,
    })),
    { key: "overall", name: "Razem", summary: overall },
  ];
}

function Table({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: { key: string; cells: ReactNode[]; total: boolean }[];
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
            {headers.map((header, index) => (
              <th
                key={header}
                scope="col"
                className={`py-2 pr-3 font-medium ${index === 0 ? "" : "text-right"}`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className={`border-b border-neutral-100 ${row.total ? "font-semibold" : ""}`}
            >
              {row.cells.map((cell, index) =>
                index === 0 ? (
                  <th key={index} scope="row" className="py-2 pr-3 text-left font-medium">
                    {cell}
                  </th>
                ) : (
                  <td key={index} className="py-2 pr-3 text-right tabular-nums">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QualityEditsTable({
  categories,
  overall,
}: {
  categories: CategoryReport[];
  overall: QualitySummary;
}) {
  return (
    <Table
      caption="Opublikowane i edycje redaktora na kategorię"
      headers={[
        "Kategoria",
        "Opublikowane",
        "Bez edycji",
        "Tytuł/lead",
        "Treść",
        "Bez edycji %",
        "Bez zmian treści %",
        "Odrzucone",
        "Czeka na decyzję",
      ]}
      rows={rowsOf(categories, overall).map(({ key, name, summary }) => ({
        key,
        total: key === "overall",
        cells: [
          name,
          summary.published,
          summary.edits.none,
          summary.edits.headline,
          summary.edits.content,
          formatShare(summary.noEditShare),
          formatShare(summary.noContentChangeShare),
          summary.rejected,
          summary.awaitingDecision,
        ],
      }))}
    />
  );
}

export function QualityScoresTable({
  categories,
  overall,
}: {
  categories: CategoryReport[];
  overall: QualitySummary;
}) {
  return (
    <Table
      caption="Średnie oceny automatyczne na kategorię"
      headers={[
        "Kategoria",
        "Ocen",
        "Fakty",
        "Jakość",
        "Rozrzut jakości",
        "Clickbait",
        "Oryginalność",
        "SEO",
        "Twierdzenia bez podparcia",
      ]}
      rows={rowsOf(categories, overall).map(({ key, name, summary }) => ({
        key,
        total: key === "overall",
        cells: [
          name,
          summary.scores.count,
          formatScore(summary.scores.factualAccuracy),
          formatScore(summary.scores.quality),
          summary.scores.qualityStddev === null
            ? "—"
            : `± ${Math.round(summary.scores.qualityStddev * 100)} pp`,
          formatScore(summary.scores.clickbait),
          formatScore(summary.scores.originality),
          formatScore(summary.scores.seo),
          summary.scores.withUnsupportedClaims,
        ],
      }))}
    />
  );
}

export function QualityCostTable({
  categories,
  overall,
}: {
  categories: CategoryReport[];
  overall: QualitySummary;
}) {
  return (
    <Table
      caption="Koszt wywołań modelu na kategorię"
      headers={[
        "Kategoria",
        "Wywołania",
        "Koszt",
        "Na opublikowany",
        "Bez ceny",
        "Nieudane",
        "Eskalowane",
      ]}
      rows={rowsOf(categories, overall).map(({ key, name, summary }) => ({
        key,
        total: key === "overall",
        cells: [
          name,
          summary.cost.calls,
          formatUsd(summary.cost.costUsd),
          formatUsd(summary.cost.costPerPublishedUsd),
          summary.cost.unpricedCalls,
          summary.cost.failedCalls,
          summary.cost.escalatedCalls,
        ],
      }))}
    />
  );
}
