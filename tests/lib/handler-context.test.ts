import { describe, expect, it } from "vitest";
import { pipelineFlag } from "@shared/lib/handler-context.ts";

describe("pipelineFlag", () => {
  it("brak wartosci oznacza wlaczone", () => {
    expect(pipelineFlag(null)).toBe(true);
    expect(pipelineFlag(undefined)).toBe(true);
  });

  it("false wylacza pipeline", () => {
    expect(pipelineFlag(false)).toBe(false);
    expect(pipelineFlag(true)).toBe(true);
  });
});
