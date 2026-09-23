import { articleDraftOutputSchema, draftIssues } from "../contracts/article.ts";
import { parseJobPayload } from "../contracts/jobs.ts";
import { loadArticleContext } from "../lib/article-context.ts";
import { itemSetDedupeKey } from "../lib/facts.ts";
import type { HandlerContext, JobHandler } from "../lib/handler-context.ts";
import { enqueueJob, JobError } from "../lib/jobs.ts";
import { logInfo } from "../lib/log.ts";
import { loadApprovedFacts } from "../lib/story-facts.ts";
import { HIGH_IMPORTANCE } from "../lib/taxonomy.ts";
import { callLlm } from "../llm/call.ts";
import { loadPrompt } from "../llm/prompts.ts";

/** Check articles_title_length w migracji 0011. */
const DB_TITLE_MAX = 90;

/**
 * Tresc artykulu z zatwierdzonych faktow i kontekstu z bazy. Model nie widzi
 * tekstow zrodel. Tytul i slug sa tymczasowe - ustalaja je GENERATE_TITLE i GENERATE_SEO.
 */
export const handleGenerateArticle: JobHandler = async (job, ctx) => {
  const { storyId } = parseJobPayload("GENERATE_ARTICLE", job.payload);

  const story = await loadStory(ctx, storyId);
  if (story.article && story.article.status !== "draft") {
    // Artykul jest juz u redaktora albo opublikowany - nie nadpisujemy jego pracy.
    logInfo("article.skipped_not_draft", { storyId, status: story.article.status });
    return;
  }

  const approved = await loadApprovedFacts(ctx, storyId);
  if (
    !approved ||
    (job.dedupe_key &&
      job.dedupe_key !== itemSetDedupeKey("GENERATE_ARTICLE", storyId, approved.setKey))
  ) {
    logInfo("article.stale_facts", { storyId });
    return;
  }

  const sourceById = new Map(approved.sources.map((source) => [source.sourceId, source]));
  const { context } = await loadArticleContext(
    ctx,
    [story.title, ...approved.facts.map((fact) => fact.statement_pl)].join(" "),
  );

  const { data, model, promptVersion } = await callLlm(
    {
      stage: "write",
      prompt: await loadPrompt("03-write-article"),
      input: {
        facts: approved.facts.map((fact) => ({
          id: fact.id,
          statement_pl: fact.statement_pl,
          sources: fact.sources.flatMap(({ sourceId }) => {
            const source = sourceById.get(sourceId);
            return source ? [{ name: source.sourceName, type: source.sourceType }] : [];
          }),
        })),
        context,
      },
      schema: articleDraftOutputSchema,
      escalate:
        (approved.publishability === "review" && approved.conflicts.length > 0) ||
        story.importance >= HIGH_IMPORTANCE,
      storyId,
      jobId: job.id,
      fixtureVars: Object.fromEntries(approved.facts.map((fact, i) => [`fact_${i + 1}`, fact.id])),
    },
    ctx,
  );

  const issues = draftIssues(
    data,
    approved.facts.map((fact) => fact.id),
  );
  if (issues.length > 0) {
    throw new JobError(`Draft niezgodny z regulami: ${issues.join(" ")}`);
  }

  const content = { version: 1 as const, blocks: data.blocks };
  const { data: article, error } = await ctx.client
    .from("articles")
    .upsert(
      {
        story_id: storyId,
        title: story.title.slice(0, DB_TITLE_MAX),
        slug: `draft-${storyId}`,
        lead: data.lead,
        excerpt: data.excerpt,
        content,
        status: "draft",
        category_id: story.category_id,
        ai_generated: true,
        model_used: model,
        prompt_version: promptVersion,
      },
      { onConflict: "story_id" },
    )
    .select("id, title")
    .single();

  if (error) {
    throw new JobError(`Zapis artykulu historii ${storyId}: ${error.message}`);
  }

  const revision = await ctx.client.from("article_revisions").insert({
    article_id: article.id,
    title: article.title,
    lead: data.lead,
    content,
    edited_by: null,
  });
  if (revision.error) {
    throw new JobError(`Zapis wersji AI artykulu ${article.id}: ${revision.error.message}`);
  }

  await enqueueJob(ctx.client, {
    type: "GENERATE_TITLE",
    payload: { storyId },
    dedupeKey: itemSetDedupeKey("GENERATE_TITLE", storyId, approved.setKey),
    storyId,
    articleId: article.id,
  });

  logInfo("article.drafted", { storyId, articleId: article.id, model });
};

async function loadStory(ctx: HandlerContext, storyId: string) {
  const { data, error } = await ctx.client
    .from("stories")
    .select("title, importance, category_id, articles(status)")
    .eq("id", storyId)
    .maybeSingle();

  if (error || !data) {
    throw new JobError(`Odczyt historii ${storyId}: ${error?.message ?? "brak wiersza"}`);
  }

  const [article] = Array.isArray(data.articles)
    ? data.articles
    : data.articles
      ? [data.articles]
      : [];
  return { ...data, article: article ?? null };
}
