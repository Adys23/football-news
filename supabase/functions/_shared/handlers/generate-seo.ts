import { seoOutputSchema } from "../contracts/article.ts";
import { parseJobPayload } from "../contracts/jobs.ts";
import { itemSetDedupeKey, itemSetKey } from "../lib/facts.ts";
import type { HandlerContext, JobHandler } from "../lib/handler-context.ts";
import { enqueueJob, JobError } from "../lib/jobs.ts";
import { logInfo } from "../lib/log.ts";
import { uniqueSlug } from "../lib/slug.ts";
import { loadStorySources } from "../lib/story-sources.ts";
import { checkTitle } from "../lib/title-guard.ts";
import { callLlm } from "../llm/call.ts";
import { loadPrompt } from "../llm/prompts.ts";

/**
 * Metadane z tytulu i leadu. seo_title przechodzi te sama kontrole co tytul,
 * a slug dostaje sufiks, gdy jest zajety przez inny artykul.
 */
export const handleGenerateSeo: JobHandler = async (job, ctx) => {
  const { articleId } = parseJobPayload("GENERATE_SEO", job.payload);

  const article = await loadArticle(ctx, articleId);
  if (article.status !== "draft") {
    logInfo("seo.skipped_not_draft", { articleId, status: article.status });
    return;
  }

  const sources = await loadStorySources(ctx, article.story_id);
  const setKey = await itemSetKey(sources.map((source) => source.sourceItemId));
  if (
    job.dedupe_key &&
    job.dedupe_key !== itemSetDedupeKey("GENERATE_SEO", article.story_id, setKey)
  ) {
    logInfo("seo.stale_item_set", { articleId });
    return;
  }

  const { data } = await callLlm(
    {
      stage: "seo",
      prompt: await loadPrompt("07-generate-seo"),
      input: { title: article.title, lead: article.lead },
      schema: seoOutputSchema,
      storyId: article.story_id,
      jobId: job.id,
    },
    ctx,
  );

  const seoTitleCheck = checkTitle(data.seo_title);
  if (!seoTitleCheck.ok) {
    throw new JobError(
      `seo_title nie przeszedl kontroli: ${seoTitleCheck.issues.map((issue) => issue.message).join(" ")}`,
    );
  }

  const slug = uniqueSlug(data.slug, await takenSlugs(ctx, data.slug, articleId));
  const { error } = await ctx.client
    .from("articles")
    .update({ seo_title: data.seo_title, seo_description: data.seo_description, slug })
    .eq("id", articleId)
    .eq("status", "draft");
  if (error) {
    throw new JobError(`Zapis SEO artykulu ${articleId}: ${error.message}`);
  }

  await enqueueJob(ctx.client, {
    type: "CHECK_ARTICLE",
    payload: { articleId },
    dedupeKey: itemSetDedupeKey("CHECK_ARTICLE", article.story_id, setKey),
    storyId: article.story_id,
    articleId,
  });

  logInfo("seo.generated", { articleId, slug });
};

async function loadArticle(ctx: HandlerContext, articleId: string) {
  const { data, error } = await ctx.client
    .from("articles")
    .select("id, story_id, title, lead, status")
    .eq("id", articleId)
    .maybeSingle();

  if (error || !data) {
    throw new JobError(`Odczyt artykulu ${articleId}: ${error?.message ?? "brak wiersza"}`);
  }

  return data;
}

/** Slugi innych artykulow zaczynajace sie od bazy - kandydaci na kolizje z sufiksem. */
async function takenSlugs(
  ctx: HandlerContext,
  base: string,
  articleId: string,
): Promise<Set<string>> {
  const { data, error } = await ctx.client
    .from("articles")
    .select("slug")
    .like("slug", `${base.slice(0, 80)}%`)
    .neq("id", articleId);

  if (error) {
    throw new JobError(`Odczyt slugow: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => row.slug));
}
