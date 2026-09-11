#!/usr/bin/env node
import { fail } from "./lib/run.mjs";
import { createLocalServiceClient } from "./lib/local-supabase.mjs";

const storyId = process.argv[2];

if (!storyId) {
  fail("Uzycie: npm run story:show -- <id>");
}

const client = createLocalServiceClient();

const { data: story, error: storyError } = await client
  .from("stories")
  .select("id, title, status, importance, event_type, first_seen_at, last_updated_at")
  .eq("id", storyId)
  .maybeSingle();

if (storyError) {
  fail(storyError.message);
}

if (!story) {
  fail(`Nie znaleziono historii ${storyId}.`);
}

const { data: sources } = await client
  .from("story_sources")
  .select("match_method, similarity, source_items(id, title, url, source_id)")
  .eq("story_id", storyId);

const { data: facts } = await client
  .from("facts")
  .select("id, subject, predicate, object, confidence, verified")
  .eq("story_id", storyId);

const { data: assessment } = await client
  .from("story_assessments")
  .select("publishability, confidence, reasoning")
  .eq("story_id", storyId)
  .maybeSingle();

const { data: article } = await client
  .from("articles")
  .select("id, title, slug, status")
  .eq("story_id", storyId)
  .maybeSingle();

console.log(
  JSON.stringify(
    { story, sources: sources ?? [], facts: facts ?? [], assessment, article },
    null,
    2,
  ),
);
