import { describe, expect, it } from "vitest";
import { BASE_DELAY_MS, computeBackoffMs, isDeadLetter, nextRunAt } from "@shared/lib/backoff.ts";

describe("computeBackoffMs", () => {
  it("odpowiada funkcji fail_job z migracji 0012", () => {
    // claim_jobs zwieksza attempts przed uruchomieniem handlera,
    // wiec pierwsza porazka daje 60 sekund, a druga 120.
    expect(computeBackoffMs(0)).toBe(BASE_DELAY_MS);
    expect(computeBackoffMs(1)).toBe(60_000);
    expect(computeBackoffMs(2)).toBe(120_000);
  });

  it("odrzuca wartosci ujemne i niecalkowite", () => {
    expect(() => computeBackoffMs(-1)).toThrow(RangeError);
    expect(() => computeBackoffMs(1.5)).toThrow(RangeError);
  });
});

describe("nextRunAt", () => {
  it("przesuwa termin o wyliczone opoznienie", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");

    expect(nextRunAt(1, now).toISOString()).toBe("2026-01-01T12:01:00.000Z");
  });
});

describe("isDeadLetter", () => {
  it("kieruje do dead letter po wyczerpaniu prob", () => {
    expect(isDeadLetter(2)).toBe(false);
    expect(isDeadLetter(3)).toBe(true);
    expect(isDeadLetter(1, 1)).toBe(true);
  });
});
