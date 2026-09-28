import { describe, expect, it } from "vitest";
import {
  applyAssessmentRules,
  canGenerateArticle,
  factAssessmentOutputSchema,
  requiresEscalation,
  type AssessedFact,
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

describe("applyAssessmentRules", () => {
  const OTHER_ID = "22222222-2222-4222-8222-222222222222";
  const official: AssessedFact = {
    id: FACT_ID,
    confidence: 0.95,
    sources: [
      { sourceId: "club", trustScore: 1 },
      { sourceId: "outlet", trustScore: 0.85 },
    ],
  };

  it("usuwa z zatwierdzonych identyfikatory spoza historii", () => {
    const { assessment, unknownFactIds } = applyAssessmentRules(
      { ...base, approved_facts: [FACT_ID, OTHER_ID] },
      [official],
    );

    expect(assessment.approved_facts).toEqual([FACT_ID]);
    expect(unknownFactIds).toEqual([OTHER_ID]);
  });

  it("odrzuca, gdy zaden zatwierdzony fakt nie ma pewnosci >= 0.8", () => {
    const { assessment } = applyAssessmentRules(base, [{ ...official, confidence: 0.79 }]);

    expect(assessment.publishability).toBe("reject");
  });

  it("odrzuca, gdy zadne zrodlo zatwierdzonych faktow nie ma zaufania >= 0.8", () => {
    const { assessment } = applyAssessmentRules(base, [
      { ...official, sources: [{ sourceId: "agg", trustScore: 0.5 }] },
    ]);

    expect(assessment.publishability).toBe("reject");
  });

  it("odrzuca, gdy model zatwierdzil wylacznie nieznane fakty", () => {
    const { assessment } = applyAssessmentRules({ ...base, approved_facts: [OTHER_ID] }, [
      official,
    ]);

    expect(assessment).toMatchObject({ publishability: "reject", approved_facts: [] });
  });

  it("zostawia auto tylko przy wysokiej pewnosci, bez konfliktow i z dwoma zrodlami", () => {
    const auto = { ...base, publishability: "auto" as const, confidence: 0.93 };

    expect(applyAssessmentRules(auto, [official]).assessment.publishability).toBe("auto");
    expect(
      applyAssessmentRules({ ...auto, confidence: 0.89 }, [official]).assessment.publishability,
    ).toBe("review");
    expect(
      applyAssessmentRules(
        {
          ...auto,
          conflicts: [{ description: "Rozne kwoty.", source_indexes: [1, 2], severity: "low" }],
        },
        [official],
      ).assessment.publishability,
    ).toBe("review");
    expect(
      applyAssessmentRules(auto, [{ ...official, sources: [{ sourceId: "club", trustScore: 1 }] }])
        .assessment.publishability,
    ).toBe("review");
  });

  it("stosuje progi przekazane z settings zamiast domyslnych", () => {
    const facts = [{ ...official, confidence: 0.75 }];
    const loose = { minApprovedFactConfidence: 0.7, minSourceTrust: 0.8 };
    const strict = { minApprovedFactConfidence: 0.8, minSourceTrust: 1.01 };

    expect(applyAssessmentRules(base, facts, loose).assessment.publishability).toBe(
      base.publishability,
    );
    expect(applyAssessmentRules(base, [official], strict).assessment.publishability).toBe("reject");
  });

  it("nie podnosi reject modelu, nawet gdy progi sa spelnione", () => {
    const { assessment } = applyAssessmentRules({ ...base, publishability: "reject" }, [official]);

    expect(assessment.publishability).toBe("reject");
  });
});
