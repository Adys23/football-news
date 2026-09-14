import { parseJobPayload } from "../contracts/jobs.ts";
import { JobError } from "../lib/jobs.ts";
import { logInfo } from "../lib/log.ts";
import type { JobHandler } from "../lib/handler-context.ts";
import {
  findEntityStory,
  loadDedupeWindowHours,
  loadSimilarityThreshold,
  pickDedupeMatch,
  type SimilarStory,
  type StoryCandidate,
} from "../lib/dedupe.ts";
import type { EntityRecord } from "../lib/entities.ts";
import { findMentionedEntities } from "../lib/entities.ts";
import { categorySlugForEvent, classifyEventType, importanceFromTrust } from "../lib/taxonomy.ts";

/**
 * Grupuje material w wydarzenie. Warstwy: unique hash (przy insercie),
 * trigram tytulu, wspolna encja. Bez LLM - EXTRACT_FACTS wchodzi w etapie 2.
 */
export const handleProcessStory: JobHandler = async (job, ctx) => {
  const { sourceItemId } = parseJobPayload("PROCESS_STORY", job.payload);

  const item = await loadItem(ctx, sourceItemId);
  if (item.processed_at) {
    logInfo("story.already_processed", { sourceItemId });
    return;
  }

  const source = await loadSource(ctx, item.source_id);

  const existingLink = await ctx.client
    .from("story_sources")
    .select("story_id")
    .eq("source_item_id", sourceItemId)
    .maybeSingle();

  if (existingLink.data?.story_id) {
    await markProcessed(ctx, sourceItemId);
    return;
  }

  const threshold = await loadSimilarityThreshold(ctx.client);
  const windowHours = await loadDedupeWindowHours(ctx.client);
  const since = new Date((ctx.now ?? new Date()).getTime() - windowHours * 3_600_000).toISOString();

  const trigramHits = await findTrigramHits(ctx, item.title_normalized, since, threshold);
  const dictionary = await loadDictionary(ctx);
  const recentStories = await loadRecentStories(ctx, since);
  const entityStoryId = findEntityStory(
    item.title,
    recentStories,
    dictionary.players,
    dictionary.clubs,
  );
  const match = pickDedupeMatch(trigramHits, entityStoryId);

  let storyId: string;
  let matchMethod: "trigram" | "entity" | "hash";
  let similarity: number | null = null;

  if (match.kind === "new") {
    storyId = await createStory(ctx, item, source.trust_score, dictionary);
    matchMethod = "hash";
  } else {
    storyId = match.storyId;
    matchMethod = match.kind;
    similarity = match.kind === "trigram" ? match.similarity : null;
    await touchStory(ctx, storyId);
  }

  const { error: linkError } = await ctx.client.from("story_sources").insert({
    story_id: storyId,
    source_item_id: sourceItemId,
    match_method: matchMethod,
    similarity,
  });

  if (linkError && linkError.code !== "23505") {
    throw new JobError(`Nie udalo sie powiazac historii: ${linkError.message}`);
  }

  await markProcessed(ctx, sourceItemId);
  logInfo("story.linked", { sourceItemId, storyId, matchMethod });
};

async function loadItem(ctx: Parameters<JobHandler>[1], sourceItemId: string) {
  const { data, error } = await ctx.client
    .from("source_items")
    .select("id, source_id, title, title_normalized, processed_at")
    .eq("id", sourceItemId)
    .maybeSingle();

  if (error) {
    throw new JobError(`Odczyt source_item: ${error.message}`);
  }

  if (!data) {
    throw new JobError(`Nie znaleziono source_item ${sourceItemId}.`);
  }

  return data;
}

async function loadSource(ctx: Parameters<JobHandler>[1], sourceId: string) {
  const { data, error } = await ctx.client
    .from("sources")
    .select("id, trust_score, country")
    .eq("id", sourceId)
    .maybeSingle();

  if (error || !data) {
    throw new JobError(`Odczyt zrodla ${sourceId}: ${error?.message ?? "brak wiersza"}`);
  }

  return data;
}

async function findTrigramHits(
  ctx: Parameters<JobHandler>[1],
  titleNormalized: string,
  since: string,
  threshold: number,
): Promise<SimilarStory[]> {
  const { data, error } = await ctx.client.rpc("find_similar_stories", {
    p_title_normalized: titleNormalized,
    p_since: since,
    p_threshold: threshold,
  });

  if (error) {
    throw new JobError(`find_similar_stories: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    storyId: row.story_id,
    similarity: Number(row.similarity),
  }));
}

async function loadRecentStories(
  ctx: Parameters<JobHandler>[1],
  since: string,
): Promise<StoryCandidate[]> {
  const { data, error } = await ctx.client
    .from("stories")
    .select("id, title")
    .gte("last_updated_at", since)
    .order("last_updated_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new JobError(`Lista historii: ${error.message}`);
  }

  return data ?? [];
}

async function loadDictionary(ctx: Parameters<JobHandler>[1]): Promise<{
  players: EntityRecord[];
  clubs: (EntityRecord & { country: string })[];
}> {
  const [players, clubs] = await Promise.all([
    ctx.client.from("players").select("id, name, aliases"),
    ctx.client.from("clubs").select("id, name, aliases, country"),
  ]);

  if (players.error) {
    throw new JobError(`Slownik zawodnikow: ${players.error.message}`);
  }
  if (clubs.error) {
    throw new JobError(`Slownik klubow: ${clubs.error.message}`);
  }

  return {
    players: players.data ?? [],
    clubs: (clubs.data ?? []).map((club) => ({
      id: club.id,
      name: club.name,
      aliases: club.aliases,
      country: club.country ?? "",
    })),
  };
}

async function createStory(
  ctx: Parameters<JobHandler>[1],
  item: { title: string },
  trustScore: number,
  dictionary: { players: EntityRecord[]; clubs: (EntityRecord & { country: string })[] },
): Promise<string> {
  const eventType = classifyEventType(item.title);
  const mentioned = findMentionedEntities(item.title, dictionary.players, dictionary.clubs);
  const clubCountries = dictionary.clubs
    .filter((club) => mentioned.some((hit) => hit.type === "club" && hit.id === club.id))
    .map((club) => club.country);
  const slug = categorySlugForEvent(eventType, clubCountries);
  const categoryId = await categoryIdBySlug(ctx, slug);

  const { data, error } = await ctx.client
    .from("stories")
    .insert({
      title: item.title,
      summary: item.title,
      status: "new",
      importance: importanceFromTrust(trustScore),
      event_type: eventType,
      category_id: categoryId,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new JobError(`Tworzenie historii: ${error?.message ?? "brak id"}`);
  }

  return data.id;
}

async function categoryIdBySlug(
  ctx: Parameters<JobHandler>[1],
  slug: string,
): Promise<string | null> {
  const { data, error } = await ctx.client
    .from("categories")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    throw new JobError(`Kategoria ${slug}: ${error.message}`);
  }

  return data?.id ?? null;
}

async function touchStory(ctx: Parameters<JobHandler>[1], storyId: string): Promise<void> {
  const { error } = await ctx.client
    .from("stories")
    .update({ last_updated_at: (ctx.now ?? new Date()).toISOString() })
    .eq("id", storyId);

  if (error) {
    throw new JobError(`Aktualizacja historii: ${error.message}`);
  }
}

async function markProcessed(ctx: Parameters<JobHandler>[1], sourceItemId: string): Promise<void> {
  const { error } = await ctx.client
    .from("source_items")
    .update({ processed_at: (ctx.now ?? new Date()).toISOString() })
    .eq("id", sourceItemId);

  if (error) {
    throw new JobError(`Oznaczenie processed_at: ${error.message}`);
  }
}
