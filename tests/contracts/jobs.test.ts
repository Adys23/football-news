import { describe, expect, it } from "vitest";
import {
  DEFERRED_JOB_TYPES,
  isDeferredJobType,
  jobPayloadSchemas,
  jobTypeSchema,
  parseJobPayload,
} from "@contracts/jobs.ts";

const ID = "11111111-1111-4111-8111-111111111111";

describe("jobPayloadSchemas", () => {
  it("pokrywa wszystkie typy jobow z enuma bazy", () => {
    expect(Object.keys(jobPayloadSchemas).sort()).toEqual([...jobTypeSchema.options].sort());
  });
});

describe("parseJobPayload", () => {
  it("waliduje payload wlasciwy dla typu joba", () => {
    expect(parseJobPayload("FETCH_SOURCE", { sourceId: ID })).toEqual({ sourceId: ID });
    expect(parseJobPayload("PROCESS_STORY", { sourceItemId: ID })).toEqual({ sourceItemId: ID });
    expect(parseJobPayload("EXTRACT_FACTS", { storyId: ID })).toEqual({ storyId: ID });
    expect(parseJobPayload("CHECK_ARTICLE", { articleId: ID })).toEqual({ articleId: ID });
  });

  it("odrzuca payload nalezacy do innego etapu", () => {
    expect(() => parseJobPayload("EXTRACT_FACTS", { articleId: ID })).toThrow();
    expect(() => parseJobPayload("PUBLISH_ARTICLE", { storyId: ID })).toThrow();
  });

  it("odrzuca brakujacy i niepoprawny identyfikator", () => {
    expect(() => parseJobPayload("FETCH_SOURCE", {})).toThrow();
    expect(() => parseJobPayload("FETCH_SOURCE", { sourceId: "1" })).toThrow();
    expect(() => parseJobPayload("FETCH_SOURCE", null)).toThrow();
  });
});

describe("isDeferredJobType", () => {
  it("odroczone typy nie maja handlerow w MVP", () => {
    for (const type of DEFERRED_JOB_TYPES) {
      expect(isDeferredJobType(type)).toBe(true);
    }

    expect(isDeferredJobType("EXTRACT_FACTS")).toBe(false);
  });
});
