import { z } from "zod";

/**
 * Kontrakt etapu VALIDATE_FACTS (prompt 02-assess-facts.md).
 *
 * Model ocenia zestaw faktow historii: co jest potwierdzone, gdzie zrodla sie
 * przecza i czy material da sie opublikowac. Tylko fakty z approved_facts
 * trafiaja do etapu pisania.
 */

export const publishabilitySchema = z.enum(["auto", "review", "reject"]);

export const conflictSeveritySchema = z.enum(["low", "medium", "high"]);

export const factConflictSchema = z.object({
  description: z.string().min(1),
  source_indexes: z.array(z.number().int().positive()).min(2),
  severity: conflictSeveritySchema,
});

export const rejectedFactSchema = z.object({
  id: z.uuid(),
  reason: z.string().min(1),
});

export const factAssessmentOutputSchema = z.object({
  publishability: publishabilitySchema,
  confidence: z.number().min(0).max(1),
  conflicts: z.array(factConflictSchema).default([]),
  approved_facts: z.array(z.uuid()).default([]),
  rejected_facts: z.array(rejectedFactSchema).default([]),
  reasoning: z.string().min(1),
});

export type Publishability = z.infer<typeof publishabilitySchema>;
export type FactConflict = z.infer<typeof factConflictSchema>;
export type FactAssessmentOutput = z.infer<typeof factAssessmentOutputSchema>;

/**
 * Historia bez zatwierdzonych faktow nie moze przejsc do generowania tekstu,
 * nawet jesli model zwrocil publishability inne niz reject.
 */
export function canGenerateArticle(assessment: FactAssessmentOutput): boolean {
  return assessment.publishability !== "reject" && assessment.approved_facts.length > 0;
}

/**
 * Progi z docs/ai-pipeline.md, sekcja 4. Obowiazuja niezaleznie od tego, co zwrocil model.
 * Wartosci runtime sa w `settings`; te stale to wartosci domyslne.
 */
export const MIN_APPROVED_FACT_CONFIDENCE = 0.8;
export const MIN_SOURCE_TRUST = 0.8;
export const AUTO_MIN_CONFIDENCE = 0.9;

export type AssessmentThresholds = {
  minApprovedFactConfidence: number;
  minSourceTrust: number;
};

/** Fakt historii widziany przez reguly: pewnosc z ekstrakcji i zrodla, ktore go podaja. */
export type AssessedFact = {
  id: string;
  confidence: number;
  sources: { sourceId: string; trustScore: number }[];
};

/**
 * Naklada deterministyczne progi na ocene modelu. Model moze byc ostrozniejszy
 * od regul (reject zostaje rejectem), ale nigdy mniej ostrozny: nie zatwierdzi
 * faktu spoza historii i nie da `auto` bez dwoch niezaleznych zrodel.
 */
export function applyAssessmentRules(
  assessment: FactAssessmentOutput,
  facts: AssessedFact[],
  thresholds: AssessmentThresholds = {
    minApprovedFactConfidence: MIN_APPROVED_FACT_CONFIDENCE,
    minSourceTrust: MIN_SOURCE_TRUST,
  },
): { assessment: FactAssessmentOutput; unknownFactIds: string[] } {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const approved = assessment.approved_facts.filter((id) => byId.has(id));
  const unknownFactIds = assessment.approved_facts.filter((id) => !byId.has(id));
  const approvedFacts = approved.flatMap((id) => byId.get(id) ?? []);

  const hasConfidentFact = approvedFacts.some(
    (fact) => fact.confidence >= thresholds.minApprovedFactConfidence,
  );
  const sources = approvedFacts.flatMap((fact) => fact.sources);
  const hasTrustedSource = sources.some((source) => source.trustScore >= thresholds.minSourceTrust);
  const independentSources = new Set(sources.map((source) => source.sourceId)).size;

  let publishability = assessment.publishability;
  if (!hasConfidentFact || !hasTrustedSource) {
    publishability = "reject";
  } else if (
    publishability === "auto" &&
    (assessment.confidence < AUTO_MIN_CONFIDENCE ||
      assessment.conflicts.length > 0 ||
      independentSources < 2)
  ) {
    publishability = "review";
  }

  return {
    assessment: { ...assessment, publishability, approved_facts: approved },
    unknownFactIds,
  };
}

/** Czy ocena wymaga mocniejszego modelu w kolejnym etapie. */
export function requiresEscalation(
  assessment: FactAssessmentOutput,
  escalationConfidence: number,
): boolean {
  return (
    assessment.confidence < escalationConfidence ||
    assessment.conflicts.some((conflict) => conflict.severity === "high")
  );
}
