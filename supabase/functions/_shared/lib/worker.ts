import { claimJobs, completeJob, failJob } from "./jobs.ts";
import { logError, logInfo } from "./log.ts";
import type { HandlerContext } from "./handler-context.ts";
import { isPipelineEnabled } from "./handler-context.ts";
import { jobHandlers, STAGE_ONE_JOB_TYPES } from "../handlers/index.ts";

export async function processJobBatch(ctx: HandlerContext, limit = 10): Promise<number> {
  if (!(await isPipelineEnabled(ctx.client))) {
    logInfo("worker.pipeline_disabled", {});
    return 0;
  }

  const jobs = await claimJobs(ctx.client, {
    types: [...STAGE_ONE_JOB_TYPES],
    limit,
    worker: ctx.worker ?? "process-jobs",
  });

  for (const job of jobs) {
    const handler = jobHandlers[job.type];

    try {
      if (!handler) {
        throw new Error(`Brak handlera dla ${job.type} w etapie 1.`);
      }

      await handler(job, ctx);
      await completeJob(ctx.client, job.id);
      logInfo("job.done", { jobId: job.id, type: job.type });
    } catch (error) {
      const message = error instanceof Error ? error.message : "nieznany blad";
      logError("job.failed", { jobId: job.id, type: job.type, message });
      await failJob(ctx.client, job.id, message);
    }
  }

  return jobs.length;
}
