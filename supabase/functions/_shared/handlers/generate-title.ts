import { titleCandidatesOutputSchema, titleSelectionOutputSchema } from "../contracts/article.ts";
import { parseJobPayload } from "../contracts/jobs.ts";
import { loadArticleContext } from "../lib/article-context.ts";
import { itemSetDedupeKey } from "../lib/facts.ts";
import type { HandlerContext, JobHandler } from "../lib/handler-context.ts";
import { enqueueJob, JobError } from "../lib/jobs.ts";
import { logInfo } from "../lib/log.ts";
import { loadApprovedFacts } from "../lib/story-facts.ts";
import { checkTitle } from "../lib/title-guard.ts";
import { callLlm } from "../llm/call.ts";
import { loadPrompt } from "../llm/prompts.ts";

/**
 * Tytul w dwoch wywolaniach: 5 propozycji, potem wybor. Miedzy nimi i po wyborze
 * dziala deterministyczna kontrola tytulu - model nie wybierze kandydata,
 * ktory jej nie przeszedl, i nie zapisze tytulu spoza listy.
 */
export const handleGenerateTitle: JobHandler = async (job, ctx) => {
  const { storyId } = parseJobPayload("GENERATE_TITLE", job.payload);

  const article = await loadDraftArticle(ctx, storyId);
  if (!article) {
    logInfo("title.skipped_not_draft", { storyId });
    return;
  }

  const approved = await loadApprovedFacts(ctx, storyId);
  if (
    !approved ||
    (job.dedupe_key &&
      job.dedupe_key !== itemSetDedupeKey("GENERATE_TITLE", storyId, approved.setKey))
  ) {
    logInfo("title.stale_facts", { storyId });
    return;
  }

  const facts = approved.facts.map((fact) => ({ statement_pl: fact.statement_pl }));
  const { entityNames, entityLabels } = await loadArticleContext(
    ctx,
    approved.facts.map((fact) => fact.statement_pl).join(" "),
  );
  // Bez rozpoznanej encji w slowniku nie da sie wymagac jej w tytule - reszta regul obowiazuje.
  const check = (title: string) => checkTitle(title, { knownEntities: entityLabels });

  const candidates = await callLlm(
    {
      stage: "title",
      prompt: await loadPrompt("04-generate-titles"),
      input: { facts, lead: article.lead, entities: entityNames },
      schema: titleCandidatesOutputSchema,
      storyId,
      jobId: job.id,
    },
    ctx,
  );

  const passing = candidates.data.titles.filter((title) => check(title).ok);
  if (passing.length === 0) {
    throw new JobError(`Zaden z 5 tytulow nie przeszedl kontroli dla historii ${storyId}.`);
  }

  const selection = await callLlm(
    {
      stage: "title",
      prompt: await loadPrompt("05-select-title"),
      input: { titles: passing, facts, lead: article.lead },
      schema: titleSelectionOutputSchema,
      storyId,
      jobId: job.id,
    },
    ctx,
  );

  const title = selection.data.selected.trim();
  if (!passing.includes(title) || !check(title).ok) {
    throw new JobError(`Wybrany tytul spoza zatwierdzonych kandydatow: "${title}".`);
  }

  const { error } = await ctx.client
    .from("articles")
    .update({ title })
    .eq("id", article.id)
    .eq("status", "draft");
  if (error) {
    throw new JobError(`Zapis tytulu artykulu ${article.id}: ${error.message}`);
  }

  await enqueueJob(ctx.client, {
    type: "GENERATE_SEO",
    payload: { articleId: article.id },
    dedupeKey: itemSetDedupeKey("GENERATE_SEO", storyId, approved.setKey),
    storyId,
    articleId: article.id,
  });

  logInfo("title.selected", { storyId, articleId: article.id, candidates: passing.length });
};

async function loadDraftArticle(ctx: HandlerContext, storyId: string) {
  const { data, error } = await ctx.client
    .from("articles")
    .select("id, lead, status")
    .eq("story_id", storyId)
    .maybeSingle();

  if (error) {
    throw new JobError(`Odczyt artykulu historii ${storyId}: ${error.message}`);
  }

  if (!data) {
    throw new JobError(`Historia ${storyId} nie ma artykulu.`);
  }

  return data.status === "draft" ? data : null;
}
