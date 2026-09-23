import { SEED, SAMPLE_UUID, SAMPLE_UUID_B } from "../factories/ids.ts";
import type { ArticleDraftOutput, QaScoresOutput } from "@contracts/article.ts";
import type { FactExtractionOutput } from "@contracts/facts.ts";
import type { FactAssessmentOutput } from "@contracts/assessment.ts";

export function sampleFactExtraction(
  overrides: Partial<FactExtractionOutput> = {},
): FactExtractionOutput {
  return {
    event_type: "transfer",
    entities: [
      { type: "player", name: "Bruno Fernandes" },
      { type: "club", name: "Manchester United" },
    ],
    facts: [
      {
        subject: "Bruno Fernandes",
        predicate: "contract_extension",
        object: "Manchester United",
        statement_pl: "Bruno Fernandes przedluzyl kontrakt z Manchesterem United do 2027 roku.",
        value: { contract_until: "2027-06-30" },
        confidence: 0.95,
        source_indexes: [1],
      },
    ],
    unclear: [],
    ...overrides,
  };
}

export function sampleAssessment(
  overrides: Partial<FactAssessmentOutput> = {},
): FactAssessmentOutput {
  return {
    publishability: "review",
    confidence: 0.9,
    conflicts: [],
    approved_facts: [SAMPLE_UUID],
    rejected_facts: [],
    reasoning: "Oficjalny komunikat klubu potwierdza informacje.",
    ...overrides,
  };
}

export function sampleDraft(overrides: Partial<ArticleDraftOutput> = {}): ArticleDraftOutput {
  return {
    lead: "Bruno Fernandes przedluzyl kontrakt z Manchesterem United.",
    blocks: [
      { type: "paragraph", text: "Pierwszy akapit." },
      { type: "paragraph", text: "Drugi akapit." },
      { type: "paragraph", text: "Trzeci akapit." },
    ],
    used_fact_ids: [SAMPLE_UUID],
    excerpt: "Kontrakt do 2027 roku.",
    ...overrides,
  };
}

export function sampleQaScores(overrides: Partial<QaScoresOutput> = {}): QaScoresOutput {
  return {
    factual_accuracy: 0.97,
    originality: 0.9,
    seo: 0.88,
    clickbait: 0.03,
    quality: 0.93,
    unsupported_claims: 0,
    issues: [],
    ...overrides,
  };
}

export { SEED, SAMPLE_UUID, SAMPLE_UUID_B };
