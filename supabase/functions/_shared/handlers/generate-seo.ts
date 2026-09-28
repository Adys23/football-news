import { seoOutputSchema } from "../contracts/article.ts";
import { parseJobPayload } from "../contracts/jobs.ts";
import { itemSetDedupeKey, itemSetKey } from "../lib/facts.ts";
import type { HandlerContext, JobHandler } from "../lib/handler-context.ts";
import { enqueueJob, JobError } from "../lib/jobs.ts";
import { logInfo } from "../lib/log.ts";
import { SEO_REFRESH_STATUSES, seoJobMode, seoRefreshDedupeKey } from "../lib/seo-mode.ts";
import { uniqueSlug } from "../lib/slug.ts";
import { loadStorySources } from "../lib/story-sources.ts";
import { checkTitle } from "../lib/title-guard.ts";
import { callLlm } from "../llm/call.ts";
import { loadPrompt } from "../llm/prompts.ts";

/**
 * Metadane z tytulu i leadu. seo_title przechodzi te sama kontrole co tytul,
 * a slug dostaje sufiks, gdy jest zajety przez inny artykul.
 *
 * Po edycji tytulu lub leadu w recenzji save_article_edit (0025) czysci SEO i kolejkuje
 * ten job ponownie: wtedy powstaja tylko seo_title i seo_description, bez sluga i bez
 * ponownej kontroli jakosci.
 */
export const handleGenerateSeo: JobHandler = async (job, ctx) => {
  const { articleId } = parseJobPayload("GENERATE_SEO", job.payload);

  const article = await loadArticle(ctx, articleId);
  // Odswiezenie tylko z joba zakolejkowanego przez enqueue_seo_refresh: stary job ze
  // sciezki szkicu albo job odpiety od klucza nie placi drugi raz za to samo wywolanie.
  const mode = seoJobMode(article);
  if (mode === "refresh" && job.dedupe_key === seoRefreshDedupeKey(articleId)) {
    await refreshSeo(job.id, ctx, article);
    return;
  }
  if (mode !== "draft") {
    logInfo("seo.skipped", { articleId, status: article.status, mode });
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

  const data = await generateSeo(job.id, ctx, article);
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

type SeoArticle = Awaited<ReturnType<typeof loadArticle>>;

/** Wywolanie promptu 07 z walidacja zod (callLlm) i kontrola seo_title jak dla tytulu. */
async function generateSeo(jobId: string, ctx: HandlerContext, article: SeoArticle) {
  const { data } = await callLlm(
    {
      stage: "seo",
      prompt: await loadPrompt("07-generate-seo"),
      input: { title: article.title, lead: article.lead },
      schema: seoOutputSchema,
      storyId: article.story_id,
      jobId,
    },
    ctx,
  );

  const seoTitleCheck = checkTitle(data.seo_title);
  if (!seoTitleCheck.ok) {
    throw new JobError(
      `seo_title nie przeszedl kontroli: ${seoTitleCheck.issues.map((issue) => issue.message).join(" ")}`,
    );
  }

  return data;
}

/**
 * Zapis tylko wtedy, gdy tytul i lead sa nadal te, z ktorych powstalo SEO. Jesli redaktor
 * poprawil je w trakcie wywolania modelu, enqueue_seo_refresh odpial ten job od klucza
 * i zakolejkowal nowy, wiec zapis nie przechodzi, a ponowienie konczy sie bez pracy.
 * Zwykly blad (nie odlozenie) ogranicza ponowienia do max_attempts.
 */
async function refreshSeo(jobId: string, ctx: HandlerContext, article: SeoArticle) {
  const data = await generateSeo(jobId, ctx, article);

  const update = ctx.client
    .from("articles")
    .update({ seo_title: data.seo_title, seo_description: data.seo_description })
    .eq("id", article.id)
    .in("status", SEO_REFRESH_STATUSES)
    .eq("title", article.title)
    .or("seo_title.is.null,seo_description.is.null");
  const { data: rows, error } = await (
    article.lead === null ? update.is("lead", null) : update.eq("lead", article.lead)
  ).select("id");
  if (error) {
    throw new JobError(`Zapis odswiezonego SEO artykulu ${article.id}: ${error.message}`);
  }

  if ((rows ?? []).length === 0) {
    throw new JobError(`Artykul ${article.id} zmienil sie w trakcie odswiezania SEO`);
  }

  logInfo("seo.refreshed", { articleId: article.id });
}

async function loadArticle(ctx: HandlerContext, articleId: string) {
  const { data, error } = await ctx.client
    .from("articles")
    .select("id, story_id, title, lead, status, seo_title, seo_description")
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
