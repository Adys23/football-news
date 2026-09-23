import { describe, expect, it } from "vitest";
import { STAGE_ONE_JOB_TYPES } from "@shared/handlers/index.ts";

describe("etap 1 worker", () => {
  it("obsluguje tylko FETCH_SOURCE i PROCESS_STORY", () => {
    expect(STAGE_ONE_JOB_TYPES).toEqual(["FETCH_SOURCE", "PROCESS_STORY"]);
  });
});
