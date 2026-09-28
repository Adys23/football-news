import type { QaScoresOutput } from "../contracts/article.ts";
import { articleContentSchema, decideAfterQa, qaScoresOutputSchema } from "../contracts/article.ts";
import { parseJobPayload } from "../contracts/jobs.ts";
import { articleCheckIssues } from "../lib/article-checks.ts";
import { loadArticleContext } from "../lib/article-context.ts";
import { itemSetDedupeKey } from "../lib/facts.ts";
import type { HandlerContext, JobHandler } from "../lib/handler-context.ts";
import { DeferJobError, JobError } from "../lib/jobs.ts";
import { logInfo } from "../lib/log.ts";
import { readPipelineSettings } from "../lib/settings.ts";
import { loadApprovedFacts } from "../lib/story-facts.ts";
import { setStoryStatus } from "../lib/story-sources.ts";
import { callLlm } from "../llm/call.ts";
import { loadPrompt } from "../llm/prompts.ts";

const HOUR_MS = 60 * 60 * 1000;
const MIN_DEFER_MS = 5 * 60 * 1000;

/**
 * Ostatni etap przed redaktorem: ocena modelu plus kontrole deterministyczne.
 * Wynik decyduje tylko o tym, czy artykul trafi do `review`, czy zostanie
 * w `draft` z historia w `blocked` - zaden wynik nie publikuje.
 */
export const handleCheckArticle: JobHandler = async (job, ctx) => {
  const { articleId } = parseJobPayload("CHECK_ARTICLE", job.payload);

  const article = await loadArticle(ctx, articleId);
  if (article.status !== "draft") {
    logInfo("qa.skipped_not_draft", { articleId, status: article.status });
    return;
  }

  const approved = await loadApprovedFacts(ctx, article.story_id);
  if (
    !approved ||
    (job.dedupe_key &&
      job.dedupe_key !== itemSetDedupeKey("CHECK_ARTICLE", article.story_id, approved.setKey))
  ) {
    logInfo("qa.stale_facts", { articleId });
    return;
  }

  const settings = await readPipelineSettings(ctx.client);
  await assertHourlyLimit(ctx, settings.max_articles_per_hour);

  const content = articleContentSchema.parse(article.content);
  const { data, model, promptVersion } = await callLlm(
    {
      stage: "qa",
      prompt: await loadPrompt("06-qa-check"),
      input: {
        article: { title: article.title, lead: article.lead, blocks: content.blocks },
        facts: approved.facts.map((fact) => ({ id: fact.id, statement_pl: fact.statement_pl })),
      },
      schema: qaScoresOutputSchema,
      // Ponowna ocena po wczesniejszej kontroli idzie na model eskalacyjny (sekcja 8).
      escalate: article.scored,
      storyId: article.story_id,
      jobId: job.id,
    },
    ctx,
  );

  const { entityLabels } = await loadArticleContext(
    ctx,
    approved.facts.map((fact) => fact.statement_pl).join(" "),
  );
  const checks = articleCheckIssues({
    title: article.title,
    lead: article.lead,
    blocks: content.blocks,
    approvedFactIds: approved.facts.map((fact) => fact.id),
    sourceTexts: approved.sources.flatMap((source) => [source.title, source.content ?? ""]),
    knownEntities: entityLabels,
  });

  const scores: QaScoresOutput = {
    ...data,
    issues: [
      ...data.issues,
      ...checks.map((message) => ({ severity: "high" as const, message: `[kontrola] ${message}` })),
    ],
  };
  await saveScores(ctx, articleId, scores, { model, promptVersion });

  const decision =
    checks.length > 0
      ? "blocked"
      : decideAfterQa(scores, {
          qualityThreshold: settings.quality_threshold,
          clickbaitThreshold: settings.clickbait_threshold,
        });

  if (decision === "review") {
    const { error } = await ctx.client
      .from("articles")
      .update({ status: "review" })
      .eq("id", articleId)
      .eq("status", "draft");
    if (error) {
      throw new JobError(`Przekazanie artykulu ${articleId} do recenzji: ${error.message}`);
    }
  }

  await setStoryStatus(ctx, article.story_id, decision === "review" ? "review" : "blocked");
  logInfo("qa.decided", { articleId, decision, checks: checks.length, quality: scores.quality });
};

async function loadArticle(ctx: HandlerContext, articleId: string) {
  const { data, error } = await ctx.client
    .from("articles")
    .select("id, story_id, title, lead, content, status, article_scores(article_id)")
    .eq("id", articleId)
    .maybeSingle();

  if (error || !data) {
    throw new JobError(`Odczyt artykulu ${articleId}: ${error?.message ?? "brak wiersza"}`);
  }

  const scores = data.article_scores;
  return { ...data, scored: Array.isArray(scores) ? scores.length > 0 : scores !== null };
}

/**
 * Limit artykulow przekazanych redaktorowi w ciagu godziny. Przekroczenie odklada
 * joba do chwili, gdy najstarszy policzony artykul wypadnie z okna - bez zuzycia
 * prob, wiec kontrola nie trafia do dead tylko dlatego, ze newsroom ma szczyt.
 */
async function assertHourlyLimit(ctx: HandlerContext, limit: number): Promise<void> {
  const now = (ctx.now ?? new Date()).getTime();
  const { data, count, error } = await ctx.client
    .from("article_scores")
    .select("checked_at, articles!inner(status)", { count: "exact" })
    .gte("checked_at", new Date(now - HOUR_MS).toISOString())
    .in("articles.status", ["review", "approved", "published"])
    .order("checked_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new JobError(`Odczyt limitu artykulow: ${error.message}`);
  }

  if ((count ?? 0) >= limit) {
    const oldest = data?.[0]?.checked_at;
    const untilFree = oldest ? new Date(oldest).getTime() + HOUR_MS - now : 0;
    throw new DeferJobError(
      `Limit ${limit} artykulow na godzine osiagniety - odlozone.`,
      Math.max(untilFree, MIN_DEFER_MS),
    );
  }
}

async function saveScores(
  ctx: HandlerContext,
  articleId: string,
  scores: QaScoresOutput,
  llm: { model: string; promptVersion: string },
): Promise<void> {
  const { error } = await ctx.client.from("article_scores").upsert(
    {
      article_id: articleId,
      factual_accuracy: scores.factual_accuracy,
      originality: scores.originality,
      seo: scores.seo,
      clickbait: scores.clickbait,
      quality: scores.quality,
      unsupported_claims: scores.unsupported_claims,
      issues: scores.issues,
      model_used: llm.model,
      prompt_version: llm.promptVersion,
      checked_at: (ctx.now ?? new Date()).toISOString(),
    },
    { onConflict: "article_id" },
  );

  if (error) {
    throw new JobError(`Zapis ocen artykulu ${articleId}: ${error.message}`);
  }
}
