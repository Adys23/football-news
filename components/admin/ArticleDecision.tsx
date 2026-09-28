"use client";

import { useActionState, useState } from "react";
import { publishArticle, rejectArticle } from "@/app/admin/artykuly/[id]/actions";
import {
  CONFIRM_STALE_SCORE_FIELD,
  MAX_REJECT_REASON_LENGTH,
  type DecisionState,
} from "@/lib/admin/publish";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** Publikuj / Odrzuc. Blokady liczy serwer tymi samymi regulami, co server action. */
export function ArticleDecision({
  articleId,
  updatedAt,
  blockers,
  scoresStale,
}: {
  articleId: string;
  updatedAt: string;
  blockers: string[];
  /** Ocena automatyczna jest sprzed edycji redaktora: publikacja wymaga potwierdzenia. */
  scoresStale: boolean;
}) {
  const [publishState, publishAction, publishing] = useActionState(publishArticle, undefined);
  const [rejectState, rejectAction, rejecting] = useActionState(rejectArticle, undefined);
  // React czysci niekontrolowane pola formularza po akcji, takze po bledzie.
  const [reason, setReason] = useState("");
  const pending = publishing || rejecting;

  return (
    <div className="mt-4 grid gap-8">
      <form action={publishAction} className="grid gap-3">
        <input type="hidden" name="articleId" value={articleId} />
        <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
        {blockers.length > 0 ? (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">Publikacja niemożliwa:</p>
            <ul className="mt-2 list-disc pl-5">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {scoresStale && blockers.length === 0 ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name={CONFIRM_STALE_SCORE_FIELD} required className="mt-1" />
            <span>
              Sprawdziłem poprawiony tekst. Wiem, że ocena automatyczna dotyczy wersji sprzed
              edycji.
            </span>
          </label>
        ) : null}
        <DecisionError state={publishState} />
        <div>
          <Button type="submit" disabled={pending || blockers.length > 0}>
            {publishing ? "Publikowanie…" : "Publikuj"}
          </Button>
        </div>
      </form>

      <form action={rejectAction} className="grid gap-3">
        <input type="hidden" name="articleId" value={articleId} />
        <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
        <div className="grid gap-2">
          <Label htmlFor="reason">Powód odrzucenia (opcjonalnie)</Label>
          <textarea
            id="reason"
            name="reason"
            rows={3}
            maxLength={MAX_REJECT_REASON_LENGTH}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border bg-transparent px-2.5 py-2 text-base outline-none focus-visible:ring-3 md:text-sm"
          />
        </div>
        <DecisionError state={rejectState} />
        <div>
          <Button type="submit" variant="destructive" disabled={pending}>
            {rejecting ? "Odrzucanie…" : "Odrzuć"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function DecisionError({ state }: { state: DecisionState }) {
  if (!state) {
    return null;
  }
  return (
    <div
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
    >
      <p className="font-medium">{state.message}</p>
      {state.issues ? (
        <ul className="mt-2 list-disc pl-5">
          {state.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
