import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { readLlmEnv } from "@shared/llm/env.ts";
import { computeCostUsd, pickModel } from "@shared/llm/models.ts";
import { loadPrompt } from "@shared/llm/prompts.ts";
import { JobError } from "@shared/lib/jobs.ts";
import { parsePipelineSettings } from "@shared/lib/settings.ts";

describe("pickModel", () => {
  const settings = parsePipelineSettings([]);

  it("domyslnie tani model, przy eskalacji mocniejszy", () => {
    expect(pickModel(settings, false)).toBe("gpt-5.6-luna");
    expect(pickModel(settings, true)).toBe("gpt-5.6-sol");
  });
});

describe("computeCostUsd", () => {
  const prices = { m: { input_per_mtok: 0.2, output_per_mtok: 1.2 } };

  it("liczy koszt za miliony tokenow i zaokragla do numeric(10, 6)", () => {
    expect(computeCostUsd("m", { tokensIn: 1_000_000, tokensOut: 0 }, prices)).toBe(0.2);
    expect(computeCostUsd("m", { tokensIn: 3, tokensOut: 1 }, prices)).toBe(0.000002);
  });

  it("zwraca null dla modelu bez cennika", () => {
    expect(computeCostUsd("inny", { tokensIn: 10, tokensOut: 10 }, prices)).toBeNull();
  });
});

describe("readLlmEnv", () => {
  it("bez jawnego LLM_ENABLED=true dziala na fixtures", () => {
    expect(readLlmEnv({}).enabled).toBe(false);
    expect(readLlmEnv({ LLM_ENABLED: "1" }).enabled).toBe(false);
    expect(readLlmEnv({ LLM_ENABLED: "true", OPENAI_API_KEY: " sk " })).toMatchObject({
      enabled: true,
      apiKey: "sk",
    });
  });

  it("pusty klucz traktuje jak brak klucza", () => {
    expect(readLlmEnv({ OPENAI_API_KEY: "  " }).apiKey).toBeNull();
  });
});

describe("loadPrompt", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "prompts-"));
  writeFileSync(path.join(dir, "01-test.md"), "Jestes analitykiem.");
  const dirUrl = pathToFileURL(`${dir}${path.sep}`);

  it("czyta plik i wersjonuje go hashem tresci", async () => {
    const prompt = await loadPrompt("01-test", dirUrl);

    expect(prompt.system).toBe("Jestes analitykiem.");
    expect(prompt.version).toMatch(/^[0-9a-f]{12}$/);
    await expect(loadPrompt("01-test", dirUrl)).resolves.toEqual(prompt);
  });

  it("odrzuca nazwy spoza konwencji i brakujace pliki", async () => {
    await expect(loadPrompt("../sekret", dirUrl)).rejects.toBeInstanceOf(JobError);
    await expect(loadPrompt("02-brak", dirUrl)).rejects.toBeInstanceOf(JobError);
  });
});
