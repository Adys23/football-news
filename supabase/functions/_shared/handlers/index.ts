import type { JobType } from "../contracts/jobs.ts";
import type { JobHandler } from "../lib/handler-context.ts";
import { handleFetchSource } from "./fetch-source.ts";
import { handleProcessStory } from "./process-story.ts";

/** Typy obslugiwane w etapie 1. Pozostale etapy LLM wchodza w etapie 2. */
export const STAGE_ONE_JOB_TYPES = [
  "FETCH_SOURCE",
  "PROCESS_STORY",
] as const satisfies readonly JobType[];

export const jobHandlers: Partial<Record<JobType, JobHandler>> = {
  FETCH_SOURCE: handleFetchSource,
  PROCESS_STORY: handleProcessStory,
};
