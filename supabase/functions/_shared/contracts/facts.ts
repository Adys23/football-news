import { z } from "zod";

/**
 * Kontrakt etapu EXTRACT_FACTS (prompt 01-extract-facts.md).
 *
 * Model dostaje tresci zrodel wraz z source_type i trust_score, a zwraca wylacznie
 * fakty, ktore wynikaja bezposrednio z tekstu. Kazdy fakt wskazuje zrodla przez
 * indeksy z wejscia - to pozwala powiazac fakt z wiarygodnoscia zrodla.
 */

export const eventTypeSchema = z.enum(["transfer", "injury", "match_result", "contract", "other"]);

export const entityTypeSchema = z.enum(["player", "club", "league"]);

export const sourceTypeSchema = z.enum([
  "official_club",
  "official_league",
  "official_federation",
  "journalist",
  "major_outlet",
  "local_outlet",
  "aggregator",
  "social",
]);

/** Jedno zrodlo podane modelowi na wejsciu. */
export const factExtractionSourceSchema = z.object({
  index: z.number().int().positive(),
  source: z.string().min(1),
  source_type: sourceTypeSchema,
  trust_score: z.number().min(0).max(1),
  published_at: z.iso.datetime().nullable(),
  title: z.string().min(1),
  content: z.string(),
});

export const factExtractionInputSchema = z.object({
  sources: z.array(factExtractionSourceSchema).min(1),
});

/** Dane liczbowe i daty towarzyszace faktowi. */
export const factValueSchema = z
  .object({
    transfer_fee: z.number().nonnegative().nullable().optional(),
    currency: z.string().length(3).nullable().optional(),
    contract_until: z.string().nullable().optional(),
    duration_years: z.number().positive().nullable().optional(),
  })
  .nullable();

export const extractedFactSchema = z.object({
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().nullable(),
  /** Fakt zapisany zdaniem po polsku - to trafia do promptu pisania. */
  statement_pl: z.string().min(1),
  value: factValueSchema,
  confidence: z.number().min(0).max(1),
  source_indexes: z.array(z.number().int().positive()).min(1),
});

export const factExtractionOutputSchema = z.object({
  event_type: eventTypeSchema,
  entities: z
    .array(
      z.object({
        type: entityTypeSchema,
        name: z.string().min(1),
      }),
    )
    .min(1),
  facts: z.array(extractedFactSchema),
  /** Czego zrodla nie podaja. Brak informacji tez jest informacja dla redaktora. */
  unclear: z.array(z.string()).default([]),
});

export type EventType = z.infer<typeof eventTypeSchema>;
export type FactExtractionSource = z.infer<typeof factExtractionSourceSchema>;
export type FactExtractionInput = z.infer<typeof factExtractionInputSchema>;
export type ExtractedFact = z.infer<typeof extractedFactSchema>;
export type FactExtractionOutput = z.infer<typeof factExtractionOutputSchema>;
