import { parseJobPayload } from "../contracts/jobs.ts";
import { factExtractionOutputSchema } from "../contracts/facts.ts";
import type { HandlerContext, JobHandler } from "../lib/handler-context.ts";
import { enqueueJob, JobError, jobExists } from "../lib/jobs.ts";
import { logInfo } from "../lib/log.ts";
import { readPipelineSettings } from "../lib/settings.ts";
import { loadStorySources, setStoryStatus } from "../lib/story-sources.ts";
import {
  buildExtractionInput,
  factRowsFromExtraction,
  itemSetDedupeKey,
  itemSetKey,
  shouldEscalateExtraction,
} from "../lib/facts.ts";
import { callLlm } from "../llm/call.ts";
import { loadPrompt } from "../llm/prompts.ts";

/**
 * Fakty ze wszystkich materialow historii. Kazde uruchomienie liczy fakty
 * od nowa dla pelnego zestawu zrodel i zastepuje poprzednie - chyba ze
 * ten zestaw byl juz wyekstrahowany (cache po dedupe_key VALIDATE_FACTS).
 */
export const handleExtractFacts: JobHandler = async (job, ctx) => {
  const { storyId } = parseJobPayload("EXTRACT_FACTS", job.payload);

  if (await hasArticle(ctx, storyId)) {
    // Aktualizacja istniejacego artykulu to UPDATE_ARTICLE (V2). W MVP nie ruszamy
    // faktow, na ktorych oparto juz tekst.
    logInfo("facts.skipped_article_exists", { storyId });
    return;
  }

  const sources = await loadStorySources(ctx, storyId);
  if (sources.length === 0) {
    throw new JobError(`Historia ${storyId} nie ma zrodel.`);
  }

  const setKey = await itemSetKey(sources.map((source) => source.sourceItemId));
  const validateKey = itemSetDedupeKey("VALIDATE_FACTS", storyId, setKey);
  if (await jobExists(ctx.client, validateKey)) {
    logInfo("facts.cache_hit", { storyId, setKey });
    return;
  }

  await setStoryStatus(ctx, storyId, "extracting");

  const settings = await readPipelineSettings(ctx.client);
  const { input, sourceMap } = buildExtractionInput(sources);
  const { data } = await callLlm(
    {
      stage: "extract",
      prompt: await loadPrompt("01-extract-facts"),
      input,
      schema: factExtractionOutputSchema,
      escalate: shouldEscalateExtraction(sources),
      storyId,
      jobId: job.id,
    },
    ctx,
  );

  const rows = factRowsFromExtraction(data, sourceMap, storyId, settings.min_fact_confidence);

  const removed = await ctx.client.from("facts").delete().eq("story_id", storyId);
  if (removed.error) {
    throw new JobError(`Usuniecie starych faktow: ${removed.error.message}`);
  }

  if (rows.length > 0) {
    const inserted = await ctx.client.from("facts").insert(rows);
    if (inserted.error) {
      throw new JobError(`Zapis faktow: ${inserted.error.message}`);
    }
  }

  await setStoryStatus(ctx, storyId, "validating");
  await enqueueJob(ctx.client, {
    type: "VALIDATE_FACTS",
    payload: { storyId, unclear: data.unclear },
    dedupeKey: validateKey,
    storyId,
  });

  logInfo("facts.extracted", { storyId, sources: sources.length, facts: rows.length });
};

async function hasArticle(ctx: HandlerContext, storyId: string): Promise<boolean> {
  const { data, error } = await ctx.client
    .from("articles")
    .select("id")
    .eq("story_id", storyId)
    .maybeSingle();

  if (error) {
    throw new JobError(`Odczyt artykulu historii ${storyId}: ${error.message}`);
  }

  return data !== null;
}
