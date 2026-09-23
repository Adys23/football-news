import type { Database } from "../contracts/database.types.ts";
import type { JobRow, ServiceClient } from "./jobs.ts";
import { JobError } from "./jobs.ts";
import type { FetchFn } from "./http.ts";
import type { LlmEnv } from "../llm/env.ts";

export type HandlerContext = {
  client: ServiceClient;
  fetchImpl?: FetchFn;
  now?: Date;
  worker?: string;
  /** Domyslnie ze zmiennych srodowiskowych. Testy i smoke podaja wlasne. */
  llmEnv?: LlmEnv;
};

export type JobHandler = (job: JobRow, ctx: HandlerContext) => Promise<void>;

export async function isPipelineEnabled(client: ServiceClient): Promise<boolean> {
  const { data, error } = await client
    .from("settings")
    .select("value")
    .eq("key", "pipeline_enabled")
    .maybeSingle();

  if (error) {
    return true;
  }

  return pipelineFlag(data?.value);
}

/** Wartosc z settings.pipeline_enabled. Brak wiersza = pipeline wlaczony. */
export function pipelineFlag(
  value: Database["public"]["Tables"]["settings"]["Row"]["value"] | null | undefined,
): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  return value !== false;
}

export type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

export async function requireSource(client: ServiceClient, sourceId: string): Promise<SourceRow> {
  const { data, error } = await client
    .from("sources")
    .select(
      "id, name, url, rss_url, kind, type, trust_score, language, sport, country, fetch_interval_minutes, etag, last_modified, last_checked_at, last_success_at, consecutive_failures, active, created_at, updated_at",
    )
    .eq("id", sourceId)
    .maybeSingle();

  if (error) {
    throw new JobError(`Nie udalo sie odczytac zrodla ${sourceId}: ${error.message}`);
  }

  if (!data) {
    throw new JobError(`Nie znaleziono zrodla ${sourceId}.`);
  }

  return data;
}
