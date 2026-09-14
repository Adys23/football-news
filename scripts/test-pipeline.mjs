#!/usr/bin/env node
/**
 * Smoke etapu 1: pieć materialow o tym samym wydarzeniu -> jedna historia.
 * Wymaga dzialajacego lokalnego Supabase. Nie wola zewnetrznego HTTP ani LLM.
 */
import { readFileSync } from "node:fs";
import { createLocalServiceClient } from "./lib/local-supabase.mjs";
import { fail } from "./lib/run.mjs";
import { parseFeed } from "../supabase/functions/_shared/lib/rss.ts";
import { enqueueJob } from "../supabase/functions/_shared/lib/jobs.ts";
import { processJobBatch } from "../supabase/functions/_shared/lib/worker.ts";

const MARKER = "https://example.test/pipeline-smoke";
const rss = readFileSync("tests/fixtures/sources/bruno-contract.rss.xml", "utf8");
const items = parseFeed(rss).items;

if (items.length < 5) {
  fail("Fixture RSS musi miec co najmniej 5 materialow.");
}

const client = createLocalServiceClient();
const feeds = new Map();
const sourceIds = [];

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

await client.from("sources").delete().in("id", sourceIds);

console.log("test:pipeline OK: 5 materialow -> 1 historia.");

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
