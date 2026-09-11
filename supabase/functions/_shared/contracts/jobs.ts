import { z } from "zod";

/**
 * Kontrakty payloadow kolejki. Payload kazdego joba jest walidowany przed
 * uruchomieniem handlera - job z nieprawidlowym payloadem trafia do dead letter
 * zamiast wywracac workera.
 */

export const jobTypeSchema = z.enum([
  "FETCH_SOURCE",
  "PROCESS_STORY",
  "EXTRACT_FACTS",
  "VALIDATE_FACTS",
  "GENERATE_ARTICLE",
  "GENERATE_TITLE",
  "GENERATE_SEO",
  "CHECK_ARTICLE",
  "PUBLISH_ARTICLE",
  "GENERATE_IMAGE",
  "UPDATE_ARTICLE",
  "GENERATE_EMBEDDING",
]);

export const jobStatusSchema = z.enum(["queued", "running", "done", "failed", "dead", "cancelled"]);

const sourcePayload = z.object({ sourceId: z.uuid() });
const sourceItemPayload = z.object({ sourceItemId: z.uuid() });
const storyPayload = z.object({ storyId: z.uuid() });
const articlePayload = z.object({ articleId: z.uuid() });

/** Payload per typ joba. Klucze odpowiadaja wartosciom enuma job_type w bazie. */
export const jobPayloadSchemas = {
  FETCH_SOURCE: sourcePayload,
  PROCESS_STORY: sourceItemPayload,
  EXTRACT_FACTS: storyPayload,
  VALIDATE_FACTS: storyPayload,
  GENERATE_ARTICLE: storyPayload,
  GENERATE_TITLE: storyPayload,
  GENERATE_SEO: articlePayload,
  CHECK_ARTICLE: articlePayload,
  PUBLISH_ARTICLE: articlePayload,
  GENERATE_IMAGE: articlePayload,
  UPDATE_ARTICLE: articlePayload,
  GENERATE_EMBEDDING: storyPayload,
} as const;

export type JobType = z.infer<typeof jobTypeSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type JobPayload<T extends JobType> = z.infer<(typeof jobPayloadSchemas)[T]>;

/** Waliduje payload zgodnie z typem joba. Rzuca ZodError przy niezgodnosci. */
export function parseJobPayload<T extends JobType>(type: T, payload: unknown): JobPayload<T> {
  return jobPayloadSchemas[type].parse(payload) as JobPayload<T>;
}

/** Typy jobow, ktore nie maja handlerow w MVP (patrz docs/roadmap.md). */
export const DEFERRED_JOB_TYPES = [
  "GENERATE_IMAGE",
  "UPDATE_ARTICLE",
  "GENERATE_EMBEDDING",
] as const satisfies readonly JobType[];

export function isDeferredJobType(type: JobType): boolean {
  return (DEFERRED_JOB_TYPES as readonly JobType[]).includes(type);
}
