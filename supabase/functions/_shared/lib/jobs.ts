import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../contracts/database.types.ts";
import {
  isDeferredJobType,
  parseJobPayload,
  type JobPayload,
  type JobType,
} from "../contracts/jobs.ts";

/**
 * Jedyny punkt dostepu do kolejki. Handlery i CLI nie pisza SQL-a na `jobs`
 * bezposrednio - ida przez te funkcje, ktore waliduja payload i wołaja RPC.
 */

export type ServiceClient = SupabaseClient<Database>;

export type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

export type EnqueueJobInput<T extends JobType> = {
  type: T;
  payload: JobPayload<T>;
  priority?: number;
  dedupeKey?: string;
  storyId?: string;
  articleId?: string;
  sourceId?: string;
};

export class JobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobError";
  }
}

/** Zakolejkowuje zadanie. Zwraca null, gdy identyczne zadanie juz czeka w kolejce. */
export async function enqueueJob<T extends JobType>(
  client: ServiceClient,
  input: EnqueueJobInput<T>,
): Promise<string | null> {
  if (isDeferredJobType(input.type)) {
    throw new JobError(
      `Typ ${input.type} nie ma handlera w MVP. Patrz docs/roadmap.md, etap 5 i 6.`,
    );
  }

  const payload = parseJobPayload(input.type, input.payload);

  const { data, error } = await client.rpc("enqueue_job", {
    p_type: input.type,
    p_payload: payload as Json,
    p_priority: input.priority,
    p_dedupe_key: input.dedupeKey,
    p_story_id: input.storyId,
    p_article_id: input.articleId,
    p_source_id: input.sourceId,
  });

  if (error) {
    throw new JobError(`enqueue_job(${input.type}): ${error.message}`);
  }

  return data;
}

/** Atomowe pobranie partii zadan. Puste typy = wszystkie typy. */
export async function claimJobs(
  client: ServiceClient,
  options: { types?: JobType[]; limit?: number; worker?: string } = {},
): Promise<JobRow[]> {
  const { data, error } = await client.rpc("claim_jobs", {
    p_types: options.types,
    p_limit: options.limit,
    p_worker: options.worker,
  });

  if (error) {
    throw new JobError(`claim_jobs: ${error.message}`);
  }

  return data ?? [];
}

export async function completeJob(client: ServiceClient, jobId: string): Promise<void> {
  const { error } = await client.rpc("complete_job", { p_id: jobId });

  if (error) {
    throw new JobError(`complete_job(${jobId}): ${error.message}`);
  }
}

export async function failJob(client: ServiceClient, jobId: string, reason: string): Promise<void> {
  const { error } = await client.rpc("fail_job", { p_id: jobId, p_error: reason });

  if (error) {
    throw new JobError(`fail_job(${jobId}): ${error.message}`);
  }
}

export async function requeueDeadJobs(client: ServiceClient, type?: JobType): Promise<number> {
  const { data, error } = await client.rpc("requeue_dead_jobs", { p_type: type });

  if (error) {
    throw new JobError(`requeue_dead_jobs: ${error.message}`);
  }

  return data ?? 0;
}

export async function requeueStaleJobs(client: ServiceClient): Promise<number> {
  const { data, error } = await client.rpc("requeue_stale_jobs");

  if (error) {
    throw new JobError(`requeue_stale_jobs: ${error.message}`);
  }

  return data ?? 0;
}
