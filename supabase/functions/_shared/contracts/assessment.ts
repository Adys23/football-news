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
