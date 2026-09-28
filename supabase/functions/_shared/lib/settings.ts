import { z } from "zod";
import type { ServiceClient } from "./jobs.ts";
import { JobError } from "./jobs.ts";

/**
 * Konfiguracja runtime etapow LLM z tabeli `settings`. Domyslne wartosci
 * odpowiadaja seedowi z migracji 0013 - brak wiersza nie zatrzymuje pipeline'u,
 * ale wiersz z blednym typem juz tak, bo to znaczy, ze ktos zepsul konfiguracje.
 */

const modelPriceSchema = z.object({
  input_per_mtok: z.number().nonnegative(),
  output_per_mtok: z.number().nonnegative(),
});

export const pipelineSettingsSchema = z.object({
  model_default: z.string().min(1).default("gpt-5.6-luna"),
  model_escalation: z.string().min(1).default("gpt-5.6-sol"),
  daily_llm_budget_usd: z.number().nonnegative().default(15),
  min_fact_confidence: z.number().min(0).max(1).default(0.6),
  escalation_confidence: z.number().min(0).max(1).default(0.8),
  min_approved_fact_confidence: z.number().min(0).max(1).default(0.8),
  min_source_trust: z.number().min(0).max(1).default(0.8),
  quality_threshold: z.number().min(0).max(1).default(0.9),
  clickbait_threshold: z.number().min(0).max(1).default(0.1),
  max_articles_per_hour: z.number().int().positive().default(12),
  /** Cennik per model w USD za milion tokenow. Brak modelu = koszt nieznany (null). */
  model_prices: z.record(z.string(), modelPriceSchema).default({}),
});

export type PipelineSettings = z.infer<typeof pipelineSettingsSchema>;
export type ModelPrices = PipelineSettings["model_prices"];

const PIPELINE_SETTING_KEYS = Object.keys(pipelineSettingsSchema.shape);

export async function readPipelineSettings(client: ServiceClient): Promise<PipelineSettings> {
  const { data, error } = await client
    .from("settings")
    .select("key, value")
    .in("key", PIPELINE_SETTING_KEYS);

  if (error) {
    throw new JobError(`Odczyt settings: ${error.message}`);
  }

  return parsePipelineSettings(data ?? []);
}

export function parsePipelineSettings(rows: { key: string; value: unknown }[]): PipelineSettings {
  const parsed = pipelineSettingsSchema.safeParse(
    Object.fromEntries(rows.map((row) => [row.key, row.value])),
  );

  if (!parsed.success) {
    throw new JobError(`Nieprawidlowe settings: ${z.prettifyError(parsed.error)}`);
  }

  return parsed.data;
}
