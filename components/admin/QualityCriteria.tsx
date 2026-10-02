import { formatShare, type CategoryReport, type CleanShareState } from "@/lib/admin/quality";

const CLEAN_SHARE_LABELS: Record<CleanShareState, string> = {
  met: "spełnione",
  not_shown: "nie wykazane",
  no_data: "brak publikacji",
};

const CLEAN_SHARE_CLASS: Record<CleanShareState, string> = {
  met: "text-green-700",
  not_shown: "text-amber-700",
  no_data: "text-neutral-500",
};

export function QualityCriteria({ categories }: { categories: CategoryReport[] }) {
  // Kryteria roadmapy dotycza kategorii; "Bez kategorii" nie moze dostac automatycznej publikacji.
  const categorized = categories.filter((category) => category.categoryId !== null);
  if (categorized.length === 0) {
    return <p className="mt-4 text-sm text-neutral-600">Brak danych w żadnej kategorii.</p>;
  }

  return (
    <ul className="mt-4 space-y-4">
      {categorized.map(({ categoryId, name, criteria }) => {
        const { daysWithEditor, cleanShare, hallucinationSignals } = criteria;
        const signals =
          hallucinationSignals.rejections + hallucinationSignals.unsupportedClaimBlocks;
        return (
          <li key={categoryId ?? "none"} className="rounded-md border border-neutral-200 p-4">
            <p className="font-medium">{name}</p>
            <dl className="mt-2 space-y-2 text-sm">
              <div>
                <dt className="text-neutral-500">
                  Co najmniej {daysWithEditor.required} dni z redaktorem w pętli
                </dt>
                <dd>
                  {daysWithEditor.value === null
                    ? "brak publikacji"
                    : `${daysWithEditor.value} dni od pierwszej publikacji`}
                  {" · "}
                  <span className={daysWithEditor.met ? "text-green-700" : "text-amber-700"}>
                    {daysWithEditor.met ? "spełnione" : "jeszcze nie"}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">
                  Ponad {formatShare(cleanShare.required)} bez poprawek merytorycznych (ostatnie{" "}
                  {cleanShare.windowDays} dni)
                </dt>
                <dd>
                  dolna granica {formatShare(cleanShare.value)} z {cleanShare.published}{" "}
                  opublikowanych
                  {" · "}
                  <span className={CLEAN_SHARE_CLASS[cleanShare.state]}>
                    {CLEAN_SHARE_LABELS[cleanShare.state]}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">
                  Zero halucynacji w ostatnich {hallucinationSignals.windowDays} dniach
                </dt>
                <dd>
                  <span className="text-neutral-500">nie mierzone wprost</span>
                  {" · "}sygnały: odrzucenia {hallucinationSignals.rejections}, blokady za
                  twierdzenia bez podparcia {hallucinationSignals.unsupportedClaimBlocks}
                  {signals === 0 ? " (brak sygnałów to nie dowód braku halucynacji)" : null}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
