import type { ServiceClient } from "./jobs.ts";
import type { EntityHit, EntityRecord } from "./entities.ts";
import { findMentionedEntities, shareEntity } from "./entities.ts";

export const DEFAULT_SIMILARITY_THRESHOLD = 0.55;
export const DEFAULT_DEDUPE_WINDOW_HOURS = 48;

export type SimilarStory = {
  storyId: string;
  similarity: number;
};

export type StoryCandidate = {
  id: string;
  title: string;
};

export type DedupeMatch =
  | { kind: "trigram"; storyId: string; similarity: number }
  | { kind: "entity"; storyId: string; similarity: null }
  | { kind: "new" };

export function pickDedupeMatch(
  trigramHits: SimilarStory[],
  entityStoryId: string | null,
): DedupeMatch {
  const best = trigramHits[0];
  if (best) {
    return { kind: "trigram", storyId: best.storyId, similarity: best.similarity };
  }

  if (entityStoryId) {
    return { kind: "entity", storyId: entityStoryId, similarity: null };
  }

  return { kind: "new" };
}

export function findEntityStory(
  title: string,
  candidates: StoryCandidate[],
  players: EntityRecord[],
  clubs: EntityRecord[],
): string | null {
  const incoming = findMentionedEntities(title, players, clubs);
  if (incoming.length === 0) {
    return null;
  }

  for (const candidate of candidates) {
    const existing = findMentionedEntities(candidate.title, players, clubs);
    if (shareEntity(incoming, existing)) {
      return candidate.id;
    }
  }

  return null;
}

export function loadSimilarityThreshold(client: ServiceClient): Promise<number> {
  return numericSetting(client, "dedupe_similarity_threshold", DEFAULT_SIMILARITY_THRESHOLD);
}

export function loadDedupeWindowHours(client: ServiceClient): Promise<number> {
  return numericSetting(client, "dedupe_window_hours", DEFAULT_DEDUPE_WINDOW_HOURS);
}

async function numericSetting(
  client: ServiceClient,
  key: string,
  fallback: number,
): Promise<number> {
  const { data, error } = await client
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error || data?.value === null || data?.value === undefined) {
    return fallback;
  }

  const parsed = Number(data.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function mentionedHits(
  title: string,
  players: EntityRecord[],
  clubs: EntityRecord[],
): EntityHit[] {
  return findMentionedEntities(title, players, clubs);
}
