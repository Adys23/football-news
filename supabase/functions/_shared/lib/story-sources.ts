import type { Database } from "../contracts/database.types.ts";
import type { StorySourceRow } from "./facts.ts";
import type { HandlerContext } from "./handler-context.ts";
import { JobError } from "./jobs.ts";

/** Materialy historii wraz ze zrodlem - wejscie ekstrakcji i walidacji faktow. */
export async function loadStorySources(
  ctx: HandlerContext,
  storyId: string,
): Promise<StorySourceRow[]> {
  const { data, error } = await ctx.client
    .from("story_sources")
    .select(
      "source_items(id, source_id, title, content, published_at, sources(name, type, trust_score, language))",
    )
    .eq("story_id", storyId);

  if (error) {
    throw new JobError(`Odczyt zrodel historii ${storyId}: ${error.message}`);
  }

  return (data ?? []).flatMap(({ source_items: item }) => {
    if (!item?.sources) {
      return [];
    }

    return [
      {
        sourceItemId: item.id,
        sourceId: item.source_id,
        sourceName: item.sources.name,
        sourceType: item.sources.type,
        trustScore: Number(item.sources.trust_score),
        language: item.sources.language,
        publishedAt: item.published_at,
        title: item.title,
        content: item.content,
      },
    ];
  });
}

export async function setStoryStatus(
  ctx: HandlerContext,
  storyId: string,
  status: Database["public"]["Enums"]["story_status"],
): Promise<void> {
  const { error } = await ctx.client.from("stories").update({ status }).eq("id", storyId);
  if (error) {
    throw new JobError(`Status historii ${storyId}: ${error.message}`);
  }
}
