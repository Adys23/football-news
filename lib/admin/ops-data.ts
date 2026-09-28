import "server-only";

import {
  OPS_JOB_STATUSES,
  OPS_JOBS_LIMIT,
  requeueErrorMessage,
  toOpsJobs,
  type OpsJob,
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
