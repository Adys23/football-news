import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  articleDraftOutputSchema,
  factAssessmentOutputSchema,
  factExtractionOutputSchema,
  draftIssues,
  qaScoresOutputSchema,
  seoOutputSchema,
  titleCandidatesOutputSchema,
  titleSelectionOutputSchema,
} from "@contracts/index.ts";
import { fillFixture } from "@shared/llm/call.ts";
import { loadPrompt } from "@shared/llm/prompts.ts";
import { checkTitle } from "@shared/lib/title-guard.ts";
import type { PromptName } from "@shared/prompts/versions.ts";
import { PROMPT_VERSIONS } from "@shared/prompts/versions.ts";

const PROMPTS_DIR = new URL("../../supabase/functions/_shared/prompts/", import.meta.url);
const FIXTURES_DIR = new URL("../../supabase/functions/_shared/llm/fixtures/", import.meta.url);

/** Kontrakt wyjscia kazdego promptu - fixture musi go spelniac tak samo jak odpowiedz modelu. */
const OUTPUT_SCHEMAS: Record<PromptName, z.ZodType> = {
  "01-extract-facts": factExtractionOutputSchema,
  "02-assess-facts": factAssessmentOutputSchema,
  "03-write-article": articleDraftOutputSchema,
  "04-generate-titles": titleCandidatesOutputSchema,
  "05-select-title": titleSelectionOutputSchema,
  "06-qa-check": qaScoresOutputSchema,
  "07-generate-seo": seoOutputSchema,
};

const FIXTURE_VARS = {
  fact_1: "f0000000-0000-4000-8000-000000000001",
  fact_2: "f0000000-0000-4000-8000-000000000002",
  fact_3: "f0000000-0000-4000-8000-000000000003",
};

const promptNames = Object.keys(PROMPT_VERSIONS) as PromptName[];

function fixture<T>(name: PromptName, schema: z.ZodType<T>): T {
  const raw = readFileSync(new URL(`${name}.json`, FIXTURES_DIR), "utf8");
  return schema.parse(JSON.parse(fillFixture(raw, FIXTURE_VARS)));
}

describe("rejestr wersji promptow", () => {
  it("obejmuje dokladnie pliki .md z katalogu promptow", () => {
    const files = readdirSync(PROMPTS_DIR)
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.replace(/\.md$/, ""))
      .sort();

    expect(files).toEqual([...promptNames].sort());
  });

  it.each(promptNames)("%s: hash w versions.ts zgadza sie z trescia pliku", async (name) => {
    const prompt = await loadPrompt(name);

    expect(prompt.version, `Zmieniony prompt ${name}: podbij version i hash`).toBe(
      PROMPT_VERSIONS[name].hash,
    );
  });
});

describe("fixtures LLM", () => {
  it.each(promptNames)("%s: fixture spelnia kontrakt wyjscia", (name) => {
    expect(() => fixture(name, OUTPUT_SCHEMAS[name])).not.toThrow();
  });

  it("artykul uzywa tylko zatwierdzonych faktow i miesci sie w limitach dlugosci", () => {
    const assessment = fixture("02-assess-facts", factAssessmentOutputSchema);
    const draft = fixture("03-write-article", articleDraftOutputSchema);

    expect(draftIssues(draft, assessment.approved_facts)).toEqual([]);
  });

  it("wybrany tytul jest jednym z kandydatow i kazdy kandydat przechodzi kontrole tytulu", () => {
    const knownEntities = fixture("01-extract-facts", factExtractionOutputSchema).entities.map(
      (entity) => entity.name,
    );
    const { titles } = fixture("04-generate-titles", titleCandidatesOutputSchema);
    const { selected } = fixture("05-select-title", titleSelectionOutputSchema);

    expect(titles).toContain(selected);
    for (const title of titles) {
      expect(checkTitle(title, { knownEntities }).issues, title).toEqual([]);
    }
  });
});
