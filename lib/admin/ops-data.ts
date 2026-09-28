import "server-only";

import {
  OPS_JOB_STATUSES,
  OPS_JOBS_LIMIT,
  latestErrorBySource,
  requeueErrorMessage,
  sourceToggleUpdate,
  toOpsJobs,
  toSourceHealthItems,
  type OpsJob,
  type SourceHealthItem,
} from "@/lib/admin/ops";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface OpsJobList {
  jobs: OpsJob[];
  total: number;
}

/** Odczyt na sesji: polityka jobs_admin_select wpuszcza tylko admina. */
export async function getOpsJobs(): Promise<OpsJobList> {
  const supabase = await createSupabaseServerClient();
  const { data, error, count } = await supabase
    .from("jobs")
    .select(
      "id, type, status, attempts, max_attempts, error, created_at, processed_at, next_run_at, story_id, article_id",
      { count: "exact" },
    )
    .in("status", OPS_JOB_STATUSES)
    // Kolejnosc wartosci w enum job_status stawia dead po failed, wiec malejaco martwe sa pierwsze.
    .order("status", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(OPS_JOBS_LIMIT);

  if (error) {
    throw new Error(`Nie udalo sie odczytac jobow: ${error.message}`);
  }

  const jobs = toOpsJobs(data);
  return { jobs, total: count ?? jobs.length };
}

/** RPC sam sprawdza is_admin(); na jobs nie ma polityki update. */
export async function requeueDeadJob(jobId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("requeue_dead_job", { p_job_id: jobId });

  if (error) {
    throw new Error(requeueErrorMessage(error));
  }

  return data;
}

export async function countDeadJobs(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "dead");

  if (error) {
    throw new Error(`Nie udalo sie policzyc martwych jobow: ${error.message}`);
  }
  return count ?? 0;
}

/** Bledy pobierania bierzemy z ostatnich jobow; tyle wystarcza przy kilkudziesieciu zrodlach. */
const SOURCE_ERROR_SCAN_LIMIT = 500;

/**
 * sources czyta editor (sources_editor_select), ale jobs tylko admin, dlatego
 * ostatni blad pobierania dociagamy wylacznie dla admina.
 */
export async function getSourcesHealth(withErrors: boolean): Promise<SourceHealthItem[]> {
  const supabase = await createSupabaseServerClient();
  const [sources, jobs] = await Promise.all([
    supabase
      .from("sources")
      .select(
        "id, name, type, trust_score, active, consecutive_failures, last_checked_at, last_success_at",
      )
      .order("name"),
    withErrors
      ? supabase
          .from("jobs")
          .select("source_id, error")
          .eq("type", "FETCH_SOURCE")
          .not("source_id", "is", null)
          .not("error", "is", null)
          .order("created_at", { ascending: false })
          .limit(SOURCE_ERROR_SCAN_LIMIT)
      : null,
  ]);

  if (sources.error) {
    throw new Error(`Nie udalo sie odczytac zrodel: ${sources.error.message}`);
  }
  if (jobs?.error) {
    throw new Error(`Nie udalo sie odczytac bledow pobierania: ${jobs.error.message}`);
  }

  return toSourceHealthItems(sources.data, latestErrorBySource(jobs?.data ?? []));
}

/**
 * Warunek na poprzedni stan sprawia, ze nieaktualny formularz niczego nie zmienia,
 * wiec zerowanie licznika nigdy nie przejdzie bez wpisu w audycie.
 * Zwraca false, gdy zrodlo mialo juz docelowy stan albo RLS nie wpuscil zapisu.
 */
export async function setSourceActive(sourceId: string, active: boolean): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sources")
    .update(sourceToggleUpdate(active))
    .eq("id", sourceId)
    .eq("active", !active)
    .select("id");

  if (error) {
    throw new Error(`Nie udalo sie zmienic zrodla: ${error.message}`);
  }
  return data.length > 0;
}
