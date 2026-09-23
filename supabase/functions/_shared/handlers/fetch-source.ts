import { parseJobPayload } from "../contracts/jobs.ts";
import { buildSourceItemHash, normalizeTitle } from "../lib/hash.ts";
import { JobError, enqueueJob } from "../lib/jobs.ts";
import { fetchFeed } from "../lib/http.ts";
import { parseFeed } from "../lib/rss.ts";
import { recordSourceFailure, recordSourceSuccess } from "../lib/circuit-breaker.ts";
import { logError, logInfo } from "../lib/log.ts";
import type { JobHandler } from "../lib/handler-context.ts";
import { requireSource } from "../lib/handler-context.ts";
import type { ParsedFeedItem } from "../lib/rss.ts";
import type { Json } from "../contracts/database.types.ts";

/**
 * Pobiera feed zrodla, zapisuje nowe source_items i kolejkuje PROCESS_STORY.
 * Idempotentne: unikalny hash i dedupe_key PROCESS_STORY:<sourceItemId>.
 */
export const handleFetchSource: JobHandler = async (job, ctx) => {
  const { sourceId } = parseJobPayload("FETCH_SOURCE", job.payload);
  const source = await requireSource(ctx.client, sourceId);

  if (!source.active) {
    logInfo("source.skipped_inactive", { sourceId });
    return;
  }

  if (source.kind === "html") {
    throw new JobError("Pobieranie HTML jest poza MVP. Tylko RSS i JSON.");
  }

  const feedUrl = source.rss_url;
  if (!feedUrl) {
    throw new JobError(`Zrodlo ${sourceId} nie ma rss_url.`);
  }

  let result;
  try {
    result = await fetchFeed(
      feedUrl,
      { etag: source.etag, lastModified: source.last_modified },
      ctx.fetchImpl,
    );
  } catch (error) {
    await markFailure(ctx, source.id, source.consecutive_failures);
    const message = error instanceof Error ? error.message : "blad sieci";
    throw new JobError(message);
  }

  if (result.kind === "not_modified") {
    await markChecked(ctx, source.id, {
      ...recordSourceSuccess(),
      etag: source.etag,
      lastModified: source.last_modified,
    });
    logInfo("source.not_modified", { sourceId });
    return;
  }

  if (result.kind === "http_error") {
    await markFailure(ctx, source.id, source.consecutive_failures);
    throw new JobError(`HTTP ${result.status} ${result.statusText}`);
  }

  let feed;
  try {
    feed = parseFeed(result.body);
  } catch (error) {
    await markFailure(ctx, source.id, source.consecutive_failures);
    const message = error instanceof Error ? error.message : "niepoprawny feed";
    throw new JobError(message);
  }
  let inserted = 0;

  for (const item of feed.items) {
    const created = await insertSourceItem(ctx, source.id, item);
    if (created) {
      inserted += 1;
      await enqueueJob(ctx.client, {
        type: "PROCESS_STORY",
        payload: { sourceItemId: created },
        dedupeKey: `PROCESS_STORY:${created}`,
        sourceId: source.id,
        priority: 60,
      });
    }
  }

  await markChecked(ctx, source.id, {
    ...recordSourceSuccess(),
    etag: result.etag,
    lastModified: result.lastModified,
  });

  logInfo("source.fetched", { sourceId, inserted, total: feed.items.length, format: feed.format });
};

async function insertSourceItem(
  ctx: Parameters<JobHandler>[1],
  sourceId: string,
  item: ParsedFeedItem,
): Promise<string | null> {
  const titleNormalized = normalizeTitle(item.title);
  const hash = await buildSourceItemHash(item.url, item.title);
  const rawData: Json = {
    title: item.title,
    url: item.url,
    guid: item.externalId,
    author: item.author,
    publishedAt: item.publishedAt,
  };

  const { data, error } = await ctx.client
    .from("source_items")
    .insert({
      source_id: sourceId,
      external_id: item.externalId,
      url: item.url,
      title: item.title,
      title_normalized: titleNormalized,
      content: item.content,
      author: item.author,
      published_at: item.publishedAt,
      hash,
      raw_data: rawData,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return null;
    }

    throw new JobError(`Zapis source_item nie powiodl sie: ${error.message}`);
  }

  return data?.id ?? null;
}

async function markChecked(
  ctx: Parameters<JobHandler>[1],
  sourceId: string,
  state: {
    consecutiveFailures: number;
    active: boolean;
    etag: string | null;
    lastModified: string | null;
  },
): Promise<void> {
  const now = (ctx.now ?? new Date()).toISOString();
  const { error } = await ctx.client
    .from("sources")
    .update({
      consecutive_failures: state.consecutiveFailures,
      active: state.active,
      etag: state.etag,
      last_modified: state.lastModified,
      last_checked_at: now,
      last_success_at: now,
    })
    .eq("id", sourceId);

  if (error) {
    throw new JobError(`Aktualizacja zrodla po sukcesie: ${error.message}`);
  }
}

async function markFailure(
  ctx: Parameters<JobHandler>[1],
  sourceId: string,
  consecutiveFailures: number,
): Promise<void> {
  const state = recordSourceFailure(consecutiveFailures);
  const { error } = await ctx.client
    .from("sources")
    .update({
      consecutive_failures: state.consecutiveFailures,
      active: state.active,
      last_checked_at: (ctx.now ?? new Date()).toISOString(),
    })
    .eq("id", sourceId);

  if (error) {
    logError("source.failure_update_failed", { sourceId, message: error.message });
  }
}
