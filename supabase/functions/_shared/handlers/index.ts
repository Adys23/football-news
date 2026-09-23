import type { JobType } from "../contracts/jobs.ts";
import type { JobHandler } from "../lib/handler-context.ts";
import { handleCheckArticle } from "./check-article.ts";
import { handleExtractFacts } from "./extract-facts.ts";
import { handleFetchSource } from "./fetch-source.ts";
import { handleGenerateArticle } from "./generate-article.ts";
import { handleGenerateSeo } from "./generate-seo.ts";
import { handleGenerateTitle } from "./generate-title.ts";
import { handleProcessStory } from "./process-story.ts";
import { handleValidateFacts } from "./validate-facts.ts";

export const jobHandlers: Partial<Record<JobType, JobHandler>> = {
  FETCH_SOURCE: handleFetchSource,
  PROCESS_STORY: handleProcessStory,
  EXTRACT_FACTS: handleExtractFacts,
  VALIDATE_FACTS: handleValidateFacts,
  GENERATE_ARTICLE: handleGenerateArticle,
  GENERATE_TITLE: handleGenerateTitle,
  GENERATE_SEO: handleGenerateSeo,
  CHECK_ARTICLE: handleCheckArticle,
};

/**
 * Worker pobiera z kolejki tylko typy, ktore maja handler. Job bez handlera
 * (kolejny etap jeszcze nie wdrozony) czeka w `queued`, zamiast isc do dead.
 */
export const ACTIVE_JOB_TYPES = Object.keys(jobHandlers) as JobType[];
