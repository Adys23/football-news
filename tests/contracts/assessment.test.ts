import { describe, expect, it } from "vitest";
import {
  canGenerateArticle,
  factAssessmentOutputSchema,
  requiresEscalation,
  type FactAssessmentOutput,
} from "@contracts/assessment.ts";

const FACT_ID = "11111111-1111-4111-8111-111111111111";

const base: FactAssessmentOutput = {
  publishability: "review",
  confidence: 0.9,
  conflicts: [],
  approved_facts: [FACT_ID],
  rejected_facts: [],
  reasoning: "Oficjalny komunikat klubu potwierdza transfer.",
};

describe("factAssessmentOutputSchema", () => {
  it("przyjmuje poprawna ocene", () => {
    expect(factAssessmentOutputSchema.parse(base).publishability).toBe("review");
  });

  it("uzupelnia domyslne puste listy", () => {
    const parsed = factAssessmentOutputSchema.parse({
      publishability: "reject",
      confidence: 0.2,
      reasoning: "Jedyne zrodlo to agregator.",
    });

    expect(parsed.conflicts).toEqual([]);
    expect(parsed.approved_facts).toEqual([]);
    expect(parsed.rejected_facts).toEqual([]);
  });

  it("wymaga co najmniej dwoch zrodel dla opisanej sprzecznosci", () => {
    const broken = {
      ...base,
      conflicts: [{ description: "Rozna kwota transferu", source_indexes: [1], severity: "high" }],
    };

    expect(() => factAssessmentOutputSchema.parse(broken)).toThrow();
  });

  it("odrzuca identyfikatory faktow, ktore nie sa uuid", () => {
    expect(() =>
      factAssessmentOutputSchema.parse({ ...base, approved_facts: ["fakt-1"] }),
    ).toThrow();
  });
});

describe("canGenerateArticle", () => {
  it("blokuje historie odrzucone i te bez zatwierdzonych faktow", () => {
    expect(canGenerateArticle(base)).toBe(true);
    expect(canGenerateArticle({ ...base, publishability: "reject" })).toBe(false);
    expect(canGenerateArticle({ ...base, approved_facts: [] })).toBe(false);
  });
});

describe("requiresEscalation", () => {
  it("eskaluje przy niskiej pewnosci", () => {
    expect(requiresEscalation({ ...base, confidence: 0.7 }, 0.8)).toBe(true);
    expect(requiresEscalation(base, 0.8)).toBe(false);
  });

  it("eskaluje przy powaznej sprzecznosci zrodel, nawet gdy pewnosc jest wysoka", () => {
    const withConflict: FactAssessmentOutput = {
      ...base,
      confidence: 0.98,
      conflicts: [
        { description: "Rozne kwoty transferu", source_indexes: [1, 2], severity: "high" },
      ],
    };

    expect(requiresEscalation(withConflict, 0.8)).toBe(true);
  });

  it("nie eskaluje przy drobnej rozbieznosci", () => {
    const withConflict: FactAssessmentOutput = {
      ...base,
      conflicts: [{ description: "Rozna data badan", source_indexes: [1, 2], severity: "low" }],
    };

    expect(requiresEscalation(withConflict, 0.8)).toBe(false);
  });
});
