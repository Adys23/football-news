import type { Enums } from "@contracts/index.ts";
import { z } from "zod";

/** Joby, ktore wymagaja uwagi admina: martwe czekaja na decyzje, failed na kolejna probe. */
export const OPS_JOB_STATUSES = [
  "dead",
  "failed",
] as const satisfies readonly Enums<"job_status">[];
export const OPS_JOBS_LIMIT = 100;
export const JOB_ERROR_PREVIEW_CHARS = 300;

export const OPS_JOB_STATUS_LABELS: Record<(typeof OPS_JOB_STATUSES)[number], string> = {
  dead: "Martwy",
  failed: "Czeka na ponowienie",
};

export interface OpsJobRow {
  id: string;
  type: Enums<"job_type">;
  status: Enums<"job_status">;
  attempts: number;
  max_attempts: number;
  error: string | null;
  created_at: string;
  processed_at: string | null;
  next_run_at: string;
  story_id: string | null;
  article_id: string | null;
}

export interface OpsJob {
  id: string;
  type: Enums<"job_type">;
  status: (typeof OPS_JOB_STATUSES)[number];
  attempts: number;
  maxAttempts: number;
  error: string | null;
  timeline: { label: string; at: string };
  target: { label: string; href: string } | null;
}

function isOpsStatus(status: Enums<"job_status">): status is OpsJob["status"] {
  return (OPS_JOB_STATUSES as readonly string[]).includes(status);
}

/**
 * jobs nie ma updated_at. fail_job ustawia processed_at tylko przy przejsciu do dead,
 * a przy failed przesuwa next_run_at o backoff - dlatego czas zalezy od statusu.
 */
export function jobTimeline(row: OpsJobRow): OpsJob["timeline"] {
  if (row.status === "dead") {
    return { label: "martwy od", at: row.processed_at ?? row.created_at };
  }
  return { label: "następna próba", at: row.next_run_at };
}

/** Link do tego, czego dotyczy job. Historia nie ma jeszcze wlasnego widoku. */
export function jobTarget(row: OpsJobRow): OpsJob["target"] {
  if (row.article_id) {
    return { label: "artykuł", href: `/admin/artykuly/${row.article_id}` };
  }
  if (row.story_id) {
    return { label: "historie", href: "/admin/historie" };
  }
  return null;
}

export function previewError(
  error: string | null,
  max: number = JOB_ERROR_PREVIEW_CHARS,
): string | null {
  if (!error) {
    return null;
  }
  return error.length > max ? `${error.slice(0, max)}…` : error;
}

export function toOpsJobs(rows: readonly OpsJobRow[]): OpsJob[] {
  return rows.flatMap((row) =>
    isOpsStatus(row.status)
      ? [
          {
            id: row.id,
            type: row.type,
            status: row.status,
            attempts: row.attempts,
            maxAttempts: row.max_attempts,
            error: previewError(row.error),
            timeline: jobTimeline(row),
            target: jobTarget(row),
          },
        ]
      : [],
  );
}

export const requeueJobInputSchema = z.object({ jobId: z.uuid() });

/** Sukces nie niesie komunikatu: po odswiezeniu listy wiersz ponowionego joba znika. */
export type RequeueState = { error: string } | undefined;

const UNIQUE_VIOLATION = "23505";

/**
 * Ponowienie narusza jobs_dedupe_idx, gdy w kolejce czeka juz nowszy job z tym samym
 * dedupe_key (np. kolejny FETCH_SOURCE dla zrodla). Wtedy martwego nie trzeba ponawiac.
 */
export function requeueErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === UNIQUE_VIOLATION) {
    return "W kolejce czeka już nowszy job tego samego zadania - tego nie trzeba ponawiać.";
  }
  return `Nie udało się ponowić joba: ${error.message}`;
}
