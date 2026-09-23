import type { FactConflict, Publishability } from "../contracts/assessment.ts";
import { factConflictSchema } from "../contracts/assessment.ts";
import type { FactGroup, FactRow, StorySourceRow } from "./facts.ts";
import { groupFacts, itemSetKey } from "./facts.ts";
import type { HandlerContext } from "./handler-context.ts";
import { JobError } from "./jobs.ts";
import { loadStorySources } from "./story-sources.ts";

export async function loadFactRows(ctx: HandlerContext, storyId: string): Promise<FactRow[]> {
  const { data, error } = await ctx.client
    .from("facts")
    .select("id, subject, predicate, object, statement_pl, confidence, source_id")
    .eq("story_id", storyId)
    .is("superseded_by", null);

  if (error) {
    throw new JobError(`Odczyt faktow historii ${storyId}: ${error.message}`);
  }

  return (data ?? []).map((row) => ({ ...row, confidence: Number(row.confidence) }));
}

export type ApprovedFacts = {
  sources: StorySourceRow[];
  setKey: string;
  publishability: Publishability;
  conflicts: FactConflict[];
  /** Zatwierdzone fakty w kolejnosci groupFacts - od niej zaleza placeholdery {{fact_N}}. */
  facts: FactGroup[];
};

/**
 * Zatwierdzone fakty historii dla etapow od pisania w dol. null oznacza, ze ocena
 * wskazuje fakty, ktorych juz nie ma (ponowna ekstrakcja w trakcie) - nowa
 * walidacja jest w drodze i ten job nie powinien niczego zapisywac.
 */
export async function loadApprovedFacts(
  ctx: HandlerContext,
  storyId: string,
): Promise<ApprovedFacts | null> {
  const { data: assessment, error } = await ctx.client
    .from("story_assessments")
    .select("publishability, conflicts, approved_fact_ids")
    .eq("story_id", storyId)
    .maybeSingle();

  if (error) {
    throw new JobError(`Odczyt oceny historii ${storyId}: ${error.message}`);
  }

  if (!assessment) {
    throw new JobError(`Historia ${storyId} nie ma oceny faktow.`);
  }

  const sources = await loadStorySources(ctx, storyId);
  const trustBySource = new Map(sources.map((source) => [source.sourceId, source.trustScore]));
  const approved = new Set(assessment.approved_fact_ids);
  // Zatwierdzony id moze byc innym wierszem grupy niz obecny reprezentant (zmiana trust_score).
  const facts = groupFacts(await loadFactRows(ctx, storyId), trustBySource).flatMap((group) => {
    const id = group.rowIds.find((rowId) => approved.has(rowId));
    return id ? [{ ...group, id }] : [];
  });

  if (approved.size === 0 || facts.length !== approved.size) {
    return null;
  }

  return {
    sources,
    setKey: await itemSetKey(sources.map((source) => source.sourceItemId)),
    publishability: assessment.publishability,
    conflicts: factConflictSchema.array().parse(assessment.conflicts),
    facts,
  };
}
