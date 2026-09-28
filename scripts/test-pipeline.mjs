#!/usr/bin/env node
/**
 * Smoke pipeline'u: piec materialow o tym samym wydarzeniu -> jedna historia ->
 * fakty -> ocena -> artykul w review. Wymaga dzialajacego lokalnego Supabase.
 * Nie wola zewnetrznego HTTP ani LLM (fixtures przy LLM_ENABLED != true).
 */
import { readFileSync } from "node:fs";
import { createLocalEditorClient, createLocalServiceClient } from "./lib/local-supabase.mjs";
import { fail } from "./lib/run.mjs";
import { parseFeed } from "../supabase/functions/_shared/lib/rss.ts";
import { enqueueJob } from "../supabase/functions/_shared/lib/jobs.ts";
import { processJobBatch } from "../supabase/functions/_shared/lib/worker.ts";
import { seoRefreshDedupeKey } from "../supabase/functions/_shared/lib/seo-mode.ts";

const MARKER = "https://example.test/pipeline-smoke";
const rss = readFileSync("tests/fixtures/sources/bruno-contract.rss.xml", "utf8");
const items = parseFeed(rss).items;

if (items.length < 5) {
  fail("Fixture RSS musi miec co najmniej 5 materialow.");
}

const client = createLocalServiceClient();
const feeds = new Map();
const sourceIds = [];

// Resztki przerwanego przebiegu: najpierw historie, bo po usunieciu zrodel
// nie da sie juz ich znalezc po adresie markera.
const { data: leftovers, error: leftoversError } = await client
  .from("story_sources")
  .select("story_id, source_items!inner(sources!inner(url))")
  .like("source_items.sources.url", `${MARKER}%`);
if (leftoversError) {
  fail(`Odczyt resztek poprzedniego przebiegu: ${leftoversError.message}`);
}
const leftoverStories = [...new Set((leftovers ?? []).map((row) => row.story_id))];
if (leftoverStories.length > 0) {
  await client.from("stories").delete().in("id", leftoverStories);
}
await client.from("sources").delete().like("url", `${MARKER}%`);

for (const [index, item] of items.slice(0, 5).entries()) {
  const rssUrl = `${MARKER}/feed-${index}.xml`;
  const oneItem = `<?xml version="1.0"?><rss version="2.0"><channel><title>s</title>
    <item><title>${escapeXml(item.title)}</title><link>${item.url}</link>
    <guid>${item.externalId ?? item.url}</guid></item></channel></rss>`;
  feeds.set(rssUrl, oneItem);

  const { data, error } = await client
    .from("sources")
    .insert({
      name: `Pipeline smoke ${index + 1}`,
      url: `${MARKER}/outlet-${index}`,
      rss_url: rssUrl,
      kind: "rss",
      type: "major_outlet",
      trust_score: 0.85,
      language: "pl",
      country: "international",
      active: true,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    fail(`Nie udalo sie wstawic zrodla: ${error?.message ?? "brak id"}`);
  }

  sourceIds.push(data.id);
  await enqueueJob(client, {
    type: "FETCH_SOURCE",
    payload: { sourceId: data.id },
    dedupeKey: `FETCH_SOURCE:${data.id}`,
    sourceId: data.id,
  });
}

const fetchImpl = async (input) => {
  const url = String(input);
  const body = feeds.get(url);
  if (!body) {
    return new Response("missing fixture", { status: 404 });
  }

  return new Response(body, { status: 200, headers: { "content-type": "application/rss+xml" } });
};

for (let i = 0; i < 20; i += 1) {
  const n = await processJobBatch({ client, fetchImpl, worker: "pipeline-smoke" }, 10);
  if (n === 0) {
    break;
  }
}

const { data: rows, error: itemsError } = await client
  .from("source_items")
  .select("id, hash, story_sources(story_id)")
  .in("source_id", sourceIds);

if (itemsError) {
  fail(itemsError.message);
}

const hashes = new Set((rows ?? []).map((row) => row.hash));
const storyIds = new Set(
  (rows ?? []).flatMap((row) => row.story_sources?.map((link) => link.story_id) ?? []),
);

if ((rows ?? []).length !== 5) {
  fail(`Oczekiwano 5 source_items, jest ${rows?.length ?? 0}.`);
}

if (hashes.size !== 5) {
  fail("Hashe source_items nie sa unikalne.");
}

if (storyIds.size !== 1) {
  fail(`Oczekiwano jednej historii, jest ${storyIds.size}.`);
}

const storyId = [...storyIds][0];
const { data: links, error: linkError } = await client
  .from("story_sources")
  .select("source_item_id")
  .eq("story_id", storyId);

if (linkError) {
  fail(linkError.message);
}

if ((links ?? []).length !== 5) {
  fail(`Oczekiwano 5 zrodel przy historii, jest ${links?.length ?? 0}.`);
}

console.log("test:pipeline OK: 5 materialow -> 1 historia.");

// Etap 2: ekstrakcja faktow na fixtures (LLM_ENABLED=false). Piec jobow EXTRACT_FACTS
// dla tej samej historii ma dac jedno wywolanie modelu - reszte odcina cache.
const [facts, calls, validateJobs] = await Promise.all([
  client.from("facts").select("id, source_item_id").eq("story_id", storyId),
  client.from("llm_calls").select("model, ok").eq("story_id", storyId).eq("stage", "extract"),
  client.from("jobs").select("status").eq("story_id", storyId).eq("type", "VALIDATE_FACTS"),
]);

for (const result of [facts, calls, validateJobs]) {
  if (result.error) {
    fail(result.error.message);
  }
}

if ((facts.data ?? []).length === 0) {
  fail("Ekstrakcja nie zapisala faktow.");
}

if ((calls.data ?? []).length !== 1 || calls.data?.[0]?.model !== "fixture") {
  fail(`Oczekiwano jednego wywolania extract na fixture, jest ${calls.data?.length ?? 0}.`);
}

if ((validateJobs.data ?? []).length !== 1) {
  fail(`Oczekiwano jednego joba VALIDATE_FACTS, jest ${validateJobs.data?.length ?? 0}.`);
}

console.log(`test:pipeline OK: 5 zrodel -> 1 ekstrakcja, ${facts.data?.length} faktow.`);

// Walidacja: fixture zatwierdza trzy fakty i kolejkuje GENERATE_ARTICLE.
const [assessment, story, articleJobs] = await Promise.all([
  client
    .from("story_assessments")
    .select("publishability, approved_fact_ids, model_used")
    .eq("story_id", storyId)
    .maybeSingle(),
  client.from("stories").select("status").eq("id", storyId).maybeSingle(),
  client.from("jobs").select("status").eq("story_id", storyId).eq("type", "GENERATE_ARTICLE"),
]);

for (const result of [assessment, story, articleJobs]) {
  if (result.error) {
    fail(result.error.message);
  }
}

const factIds = new Set((facts.data ?? []).map((row) => row.id));
const approved = assessment.data?.approved_fact_ids ?? [];

if (assessment.data?.publishability !== "review" || approved.length !== 3) {
  fail(`Oczekiwano oceny review z 3 faktami, jest ${JSON.stringify(assessment.data)}.`);
}

if (!approved.every((id) => factIds.has(id))) {
  fail("Ocena zatwierdzila fakt spoza historii.");
}

if (!story.data || (articleJobs.data ?? []).length !== 1) {
  fail(`Oczekiwano 1 joba GENERATE_ARTICLE, jest ${articleJobs.data?.length ?? 0}.`);
}

console.log("test:pipeline OK: walidacja -> 3 zatwierdzone fakty, kolejka -> GENERATE_ARTICLE.");

// Pisanie: jeden artykul, wersja AI w article_revisions, kolejka idzie do tytulu.
const [articles, titleJobs] = await Promise.all([
  client
    .from("articles")
    .select("id, status, model_used, article_revisions(edited_by)")
    .eq("story_id", storyId),
  client.from("jobs").select("status").eq("story_id", storyId).eq("type", "GENERATE_TITLE"),
]);

for (const result of [articles, titleJobs]) {
  if (result.error) {
    fail(result.error.message);
  }
}

const article = articles.data?.[0];
if ((articles.data ?? []).length !== 1 || !article) {
  fail(`Oczekiwano jednego artykulu, jest ${JSON.stringify(articles.data)}.`);
}

if (article.article_revisions?.length !== 1 || article.article_revisions[0]?.edited_by !== null) {
  fail("Oczekiwano jednej wersji AI w article_revisions.");
}

if ((titleJobs.data ?? []).length !== 1) {
  fail(`Oczekiwano jednego joba GENERATE_TITLE, jest ${titleJobs.data?.length ?? 0}.`);
}

console.log("test:pipeline OK: draft artykulu z wersja AI, kolejka -> GENERATE_TITLE.");

// Tytul i SEO: wybrany kandydat z fixture, slug z fixture, kolejka idzie do kontroli jakosci.
const [seoArticle, stageCalls, checkJobs] = await Promise.all([
  client
    .from("articles")
    .select("title, slug, seo_title, seo_description")
    .eq("id", article.id)
    .single(),
  client.from("llm_calls").select("stage").eq("story_id", storyId).in("stage", ["title", "seo"]),
  client.from("jobs").select("status").eq("article_id", article.id).eq("type", "CHECK_ARTICLE"),
]);

for (const result of [seoArticle, stageCalls, checkJobs]) {
  if (result.error) {
    fail(result.error.message);
  }
}

const stages = (stageCalls.data ?? [])
  .map((row) => row.stage)
  .sort()
  .join(",");
if (stages !== "seo,title,title") {
  fail(`Oczekiwano 2 wywolan title i 1 seo, jest ${stages}.`);
}

if (
  seoArticle.data.title !==
    "Manchester United przedłużył kontrakt z Bruno Fernandesem do 2027 roku" ||
  !seoArticle.data.slug.startsWith("bruno-fernandes-przedluzyl-kontrakt") ||
  !seoArticle.data.seo_description
) {
  fail(`Tytul lub SEO niezgodne z fixtures: ${JSON.stringify(seoArticle.data)}.`);
}

if ((checkJobs.data ?? []).length !== 1) {
  fail(`Oczekiwano jednego joba CHECK_ARTICLE, jest ${checkJobs.data?.length ?? 0}.`);
}

console.log(
  `test:pipeline OK: tytul i SEO zapisane (${seoArticle.data.slug}), kolejka -> CHECK_ARTICLE.`,
);

// Kontrola jakosci: definicja ukonczenia etapu 2 (docs/roadmap.md) - artykul w review,
// tekst tylko z zatwierdzonych faktow, koszt kazdego etapu widoczny w llm_calls.
const [finalArticle, finalStory, scores, allCalls] = await Promise.all([
  client.from("articles").select("status, content").eq("id", article.id).single(),
  client.from("stories").select("status").eq("id", storyId).single(),
  client.from("article_scores").select("quality, unsupported_claims").eq("article_id", article.id),
  client.from("llm_calls").select("stage, model, cost_usd, ok").eq("story_id", storyId),
]);

for (const result of [finalArticle, finalStory, scores, allCalls]) {
  if (result.error) {
    fail(result.error.message);
  }
}

if (finalArticle.data.status !== "review" || finalStory.data.status !== "review") {
  fail(
    `Oczekiwano artykulu i historii w review, jest ${finalArticle.data.status}/${finalStory.data.status}.`,
  );
}

if ((scores.data ?? []).length !== 1 || scores.data[0].unsupported_claims !== 0) {
  fail(`Oczekiwano jednej oceny bez twierdzen bez pokrycia, jest ${JSON.stringify(scores.data)}.`);
}

const boxedFacts = finalArticle.data.content.blocks.flatMap((block) =>
  block.type === "fact_box" ? block.factIds : [],
);
if (!boxedFacts.every((id) => approved.includes(id))) {
  fail("Tekst odwoluje sie do faktu spoza zatwierdzonych.");
}

const llmCalls = allCalls.data ?? [];
const perStage = llmCalls
  .map((row) => row.stage)
  .sort()
  .join(",");
if (
  perStage !== "extract,qa,seo,title,title,validate,write" ||
  !llmCalls.every((row) => row.ok && row.model === "fixture" && Number(row.cost_usd) === 0)
) {
  fail(`Oczekiwano 7 udanych wywolan na fixtures, jest ${perStage}.`);
}

console.log("test:pipeline OK: kontrola jakosci -> artykul w review, 7 wywolan LLM w llm_calls.");

// Odswiezenie SEO po edycji tytulu w recenzji (0025): zapis przez save_article_edit
// w sesji redaktora z seeda, tak jak w panelu, potem worker.
const editor = await createLocalEditorClient();
const { data: reviewed, error: reviewedError } = await editor
  .from("articles")
  .select("slug, lead, content, updated_at")
  .eq("id", article.id)
  .single();
if (reviewedError) {
  fail(reviewedError.message);
}

const { error: editError } = await editor.rpc("save_article_edit", {
  p_article_id: article.id,
  p_expected_updated_at: reviewed.updated_at,
  p_title: "Manchester United przedłużył kontrakt z Bruno Fernandesem do 2028 roku",
  p_lead: reviewed.lead,
  p_content: reviewed.content,
});
if (editError) {
  fail(`save_article_edit: ${editError.message}`);
}

const [cleared, queued] = await Promise.all([
  client.from("articles").select("seo_title, seo_description").eq("id", article.id).single(),
  client
    .from("jobs")
    .select("payload, status")
    .eq("type", "GENERATE_SEO")
    .eq("dedupe_key", seoRefreshDedupeKey(article.id)),
]);
for (const result of [cleared, queued]) {
  if (result.error) {
    fail(result.error.message);
  }
}
if (
  cleared.data.seo_title !== null ||
  cleared.data.seo_description !== null ||
  (queued.data ?? []).length !== 1 ||
  queued.data[0].status !== "queued" ||
  queued.data[0].payload?.articleId !== article.id
) {
  fail(
    `Edycja tytulu nie wyczyscila SEO albo nie zakolejkowala odswiezenia: ${JSON.stringify({ seo: cleared.data, jobs: queued.data })}.`,
  );
}

for (let i = 0; i < 5; i += 1) {
  const n = await processJobBatch({ client, fetchImpl, worker: "pipeline-smoke" }, 10);
  if (n === 0) {
    break;
  }
}

const [refreshed, refreshJob, seoCalls, checkJobsAfter] = await Promise.all([
  client
    .from("articles")
    .select("status, slug, seo_title, seo_description")
    .eq("id", article.id)
    .single(),
  client.from("jobs").select("status").eq("dedupe_key", seoRefreshDedupeKey(article.id)).single(),
  client.from("llm_calls").select("ok").eq("story_id", storyId).eq("stage", "seo"),
  client.from("jobs").select("status").eq("article_id", article.id).eq("type", "CHECK_ARTICLE"),
]);

for (const result of [refreshed, refreshJob, seoCalls, checkJobsAfter]) {
  if (result.error) {
    fail(result.error.message);
  }
}

if (
  refreshJob.data.status !== "done" ||
  refreshed.data.status !== "review" ||
  refreshed.data.slug !== reviewed.slug ||
  !refreshed.data.seo_title ||
  !refreshed.data.seo_description
) {
  fail(
    `Odswiezenie SEO niezgodne z oczekiwaniem: ${JSON.stringify({ job: refreshJob.data, article: refreshed.data })}.`,
  );
}

if ((seoCalls.data ?? []).length !== 2 || (checkJobsAfter.data ?? []).length !== 1) {
  fail(
    `Oczekiwano 2 wywolan seo i nadal 1 joba CHECK_ARTICLE, jest ${seoCalls.data?.length ?? 0}/${checkJobsAfter.data?.length ?? 0}.`,
  );
}

await client.from("stories").delete().eq("id", storyId);
await client.from("sources").delete().in("id", sourceIds);

console.log("test:pipeline OK: edycja tytulu -> odswiezone SEO bez zmiany sluga i bez nowego QA.");

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
