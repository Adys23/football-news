import { describe, expect, it, vi } from "vitest";
import type { ServiceClient } from "@shared/lib/jobs.ts";
import { JobError } from "@shared/lib/jobs.ts";
import { parsePipelineSettings, readPipelineSettings } from "@shared/lib/settings.ts";

describe("parsePipelineSettings", () => {
  it("brak wierszy daje wartosci z seeda", () => {
    expect(parsePipelineSettings([])).toMatchObject({
      model_default: "gpt-5.6-luna",
      model_escalation: "gpt-5.6-sol",
      daily_llm_budget_usd: 15,
      min_fact_confidence: 0.6,
      min_approved_fact_confidence: 0.8,
      min_source_trust: 0.8,
      model_prices: {},
    });
  });

  it("wartosci z bazy nadpisuja domyslne", () => {
    const settings = parsePipelineSettings([
      { key: "quality_threshold", value: 0.95 },
      { key: "model_default", value: "gpt-5.6-terra" },
    ]);

    expect(settings.quality_threshold).toBe(0.95);
    expect(settings.model_default).toBe("gpt-5.6-terra");
  });

  it("wartosc o zlym typie zatrzymuje etap", () => {
    expect(() => parsePipelineSettings([{ key: "daily_llm_budget_usd", value: "duzo" }])).toThrow(
      JobError,
    );
  });
});

describe("readPipelineSettings", () => {
  it("czyta tylko klucze pipeline'u i zglasza blad bazy", async () => {
    const inFn = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const from = vi.fn().mockReturnValue({ select: () => ({ in: inFn }) });
    const client = { from } as Pick<ServiceClient, "from"> as ServiceClient;

    await expect(readPipelineSettings(client)).rejects.toThrow(/boom/);
    expect(inFn).toHaveBeenCalledWith("key", expect.arrayContaining(["model_default"]));
  });
});
