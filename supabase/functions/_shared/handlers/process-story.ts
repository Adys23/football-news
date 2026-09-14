import { parseJobPayload } from "../contracts/jobs.ts";
import { JobError } from "../lib/jobs.ts";
import { logInfo } from "../lib/log.ts";
import type { JobHandler } from "../lib/handler-context.ts";
import type { EntityRecord } from "../lib/entities.ts";
import { findMentionedEntities } from "../lib/entities.ts";
import { categorySlugForEvent, classifyEventType, importanceFromTrust } from "../lib/taxonomy.ts";

/**
 * Grupuje material w wydarzenie. Find-or-create jest w RPC
 * `link_source_item_to_story` (lock + trigram + encja + insert w jednej transakcji).
 * Bez LLM - EXTRACT_FACTS wchodzi w etapie 2.
 */
export const handleProcessStory: JobHandler = async (job, ctx) => {
  const { sourceItemId } = parseJobPayload("PROCESS_STORY", job.payload);

  const item = await loadItem(ctx, sourceItemId);
  const source = await loadSource(ctx, item.source_id);
  const dictionary = await loadDictionary(ctx);
  const eventType = classifyEventType(item.title);
  const mentioned = findMentionedEntities(item.title, dictionary.players, dictionary.clubs);
  const clubCountries = dictionary.clubs
    .filter((club) => mentioned.some((hit) => hit.type === "club" && hit.id === club.id))
    .map((club) => club.country);
  const categoryId = await categoryIdBySlug(ctx, categorySlugForEvent(eventType, clubCountries));

  const { data, error } = await ctx.client.rpc("link_source_item_to_story", {
    p_source_item_id: sourceItemId,
    p_event_type: eventType,
    p_category_id: categoryId,
    p_importance: importanceFromTrust(source.trust_score),
  });

  if (error) {
    throw new JobError(`link_source_item_to_story: ${error.message}`);
  }

  const linked = data?.[0];
  if (!linked) {
    throw new JobError(`link_source_item_to_story nie zwrocilo historii dla ${sourceItemId}.`);
  }

  logInfo("story.linked", {
    sourceItemId,
    storyId: linked.out_story_id,
    matchMethod: linked.out_match_method,
    created: linked.out_created,
  });
};

async function loadItem(ctx: Parameters<JobHandler>[1], sourceItemId: string) {
  const { data, error } = await ctx.client
    .from("source_items")
    .select("id, source_id, title")
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
    .select("id, trust_score")
    .eq("id", sourceId)
    .maybeSingle();

  if (error || !data) {
    throw new JobError(`Odczyt zrodla ${sourceId}: ${error?.message ?? "brak wiersza"}`);
  }

  return data;
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

async function categoryIdBySlug(ctx: Parameters<JobHandler>[1], slug: string): Promise<string> {
  const { data, error } = await ctx.client
    .from("categories")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    throw new JobError(`Kategoria ${slug}: ${error.message}`);
  }

  if (!data) {
    throw new JobError(`Brak kategorii ${slug}.`);
  }

  return data.id;
}
