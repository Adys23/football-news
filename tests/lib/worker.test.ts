import { describe, expect, it } from "vitest";
import { ACTIVE_JOB_TYPES, jobHandlers } from "@shared/handlers/index.ts";
import { DEFERRED_JOB_TYPES } from "@contracts/jobs.ts";

describe("worker", () => {
  it("pobiera z kolejki dokladnie typy, ktore maja handler", () => {
    expect(ACTIVE_JOB_TYPES).toEqual([
      "FETCH_SOURCE",
      "PROCESS_STORY",
      "EXTRACT_FACTS",
      "VALIDATE_FACTS",
    ]);
    for (const type of ACTIVE_JOB_TYPES) {
      expect(jobHandlers[type]).toBeTypeOf("function");
    }
  });

  it("nie obsluguje typow odlozonych poza MVP", () => {
    for (const type of DEFERRED_JOB_TYPES) {
      expect(ACTIVE_JOB_TYPES).not.toContain(type);
    }
  });
});
