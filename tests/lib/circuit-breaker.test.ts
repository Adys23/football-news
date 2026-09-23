import { describe, expect, it } from "vitest";
import {
  SOURCE_FAILURE_LIMIT,
  recordSourceFailure,
  recordSourceSuccess,
} from "@shared/lib/circuit-breaker.ts";

describe("circuit breaker zrodla", () => {
  it("po sukcesie zeruje licznik", () => {
    expect(recordSourceSuccess()).toEqual({ consecutiveFailures: 0, active: true });
  });

  it("wylacza zrodlo po 10 kolejnych bledach", () => {
    let failures = 0;
    let active = true;

    for (let i = 0; i < SOURCE_FAILURE_LIMIT - 1; i += 1) {
      const state = recordSourceFailure(failures);
      failures = state.consecutiveFailures;
      active = state.active;
      expect(active).toBe(true);
    }

    const tripped = recordSourceFailure(failures);
    expect(tripped.consecutiveFailures).toBe(SOURCE_FAILURE_LIMIT);
    expect(tripped.active).toBe(false);
  });
});
