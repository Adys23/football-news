import type { FactAssessmentOutput } from "../contracts/assessment.ts";
import { applyAssessmentRules, factAssessmentOutputSchema } from "../contracts/assessment.ts";
import { parseJobPayload } from "../contracts/jobs.ts";
import type { HandlerContext, JobHandler } from "../lib/handler-context.ts";
import type { FactGroup } from "../lib/facts.ts";
import {
  buildExtractionInput,
  groupFacts,
  itemSetKey,
  shouldEscalateValidation,
  validateFactsDedupeKey,
} from "../lib/facts.ts";
import { enqueueJob, JobError } from "../lib/jobs.ts";
import { logInfo } from "../lib/log.ts";
import { readPipelineSettings } from "../lib/settings.ts";
import { loadStorySources, setStoryStatus } from "../lib/story-sources.ts";
import { callLlm } from "../llm/call.ts";
import { loadPrompt } from "../llm/prompts.ts";

/**
 * Ocena faktow historii: model decyduje, co jest potwierdzone, a progi
 * z applyAssessmentRules ustalaja granice, ktorych model nie przesunie.
 * Do pisania trafiaja tylko fakty z approved_fact_ids.
 */
export const handleValidateFacts: JobHandler = async (job, ctx) => {
  const { storyId, unclear } = parseJobPayload("VALIDATE_FACTS", job.payload);

  const sources = await loadStorySources(ctx, storyId);
  const setKey = await itemSetKey(sources.map((source) => source.sourceItemId));
  // Job bez klucza (np. z CLI) to swiadome wymuszenie walidacji biezacych faktow.
  if (job.dedupe_key && job.dedupe_key !== validateFactsDedupeKey(storyId, setKey)) {
    // Od ekstrakcji doszly materialy: nowa ekstrakcja zastapi fakty i zakolejkuje wlasna walidacje.
    logInfo("validate.stale_item_set", { storyId, jobKey: job.dedupe_key, setKey });
    return;
  }

  const { input: extractionInput, sourceMap } = buildExtractionInput(sources);
  // Zrodlo z kilkoma materialami dostaje najnizszy indeks - Map zachowuje pierwszy wpis.
  const indexBySource = new Map<string, number>();
  for (const [index, { sourceId }] of sourceMap) {
    if (!indexBySource.has(sourceId)) {
      indexBySource.set(sourceId, index);
    }
  }
  const trustBySource = new Map(sources.map((source) => [source.sourceId, source.trustScore]));
  const groups = groupFacts(await loadFacts(ctx, storyId), trustBySource);

  if (groups.length === 0) {
    await saveAssessment(
      ctx,
      storyId,
      {
        publishability: "reject",
        confidence: 0,
        conflicts: [],
        approved_facts: [],
        rejected_facts: [],
        reasoning: withUnclear(
          "Ekstrakcja nie zwrocila zadnego faktu powyzej progu pewnosci.",
          unclear,
        ),
      },
      null,
    );
    await setStoryStatus(ctx, storyId, "blocked");
    logInfo("validate.no_facts", { storyId });
    return;
  }

  const settings = await readPipelineSettings(ctx.client);
  const { data, model, promptVersion } = await callLlm(
    {
      stage: "validate",
      prompt: await loadPrompt("02-assess-facts"),
      input: {
        sources: extractionInput.sources.map(({ index, source, source_type, trust_score }) => ({
          index,
          source,
          source_type,
          trust_score,
        })),
        facts: groups.map((group) => ({
          id: group.id,
          statement_pl: group.statement_pl,
          confidence: group.confidence,
          source_indexes: sourceIndexes(group, indexBySource),
        })),
      },
      schema: factAssessmentOutputSchema,
      escalate: shouldEscalateValidation(groups, settings.escalation_confidence),
      storyId,
      jobId: job.id,
      fixtureVars: Object.fromEntries(groups.map((group, i) => [`fact_${i + 1}`, group.id])),
    },
    ctx,
  );

  const { assessment, unknownFactIds } = applyAssessmentRules(data, groups);
  if (unknownFactIds.length > 0) {
    logInfo("validate.unknown_fact_ids", { storyId, unknownFactIds: unknownFactIds.join(",") });
  }

  await saveAssessment(
    ctx,
    storyId,
    { ...assessment, reasoning: withUnclear(assessment.reasoning, unclear) },
    { model, promptVersion },
  );

  if (assessment.publishability === "reject" || assessment.approved_facts.length === 0) {
    await setStoryStatus(ctx, storyId, "blocked");
    logInfo("validate.rejected", { storyId });
    return;
  }

  await setStoryStatus(ctx, storyId, "drafting");
  await enqueueJob(ctx.client, {
    type: "GENERATE_ARTICLE",
    payload: { storyId },
    dedupeKey: `GENERATE_ARTICLE:${storyId}:${setKey}`,
    storyId,
  });

  logInfo("validate.approved", {
    storyId,
    publishability: assessment.publishability,
    approved: assessment.approved_facts.length,
  });
};

function sourceIndexes(group: FactGroup, indexBySource: Map<string, number>): number[] {
  return group.sources.flatMap((source) => indexBySource.get(source.sourceId) ?? []);
}

function withUnclear(reasoning: string, unclear: string[]): string {
  return unclear.length === 0 ? reasoning : `${reasoning}\n\nBrak w zrodlach: ${unclear.join(" ")}`;
}

async function loadFacts(ctx: HandlerContext, storyId: string) {
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

async function saveAssessment(
  ctx: HandlerContext,
  storyId: string,
  assessment: FactAssessmentOutput,
  llm: { model: string; promptVersion: string } | null,
): Promise<void> {
  const { error } = await ctx.client.from("story_assessments").upsert(
    {
      story_id: storyId,
      publishability: assessment.publishability,
      confidence: assessment.confidence,
      conflicts: assessment.conflicts,
      approved_fact_ids: assessment.approved_facts,
      reasoning: assessment.reasoning,
      model_used: llm?.model ?? null,
      prompt_version: llm?.promptVersion ?? null,
    },
    { onConflict: "story_id" },
  );

  if (error) {
    throw new JobError(`Zapis oceny historii ${storyId}: ${error.message}`);
  }
}
