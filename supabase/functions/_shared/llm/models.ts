import type { ModelPrices, PipelineSettings } from "../lib/settings.ts";

/** Wartosci kolumny llm_calls.stage (check w migracji 0012). */
export const LLM_STAGES = ["extract", "validate", "write", "title", "seo", "qa"] as const;

export type LlmStage = (typeof LLM_STAGES)[number];

/** Nazwa modelu zapisywana w llm_calls przy LLM_ENABLED=false. */
export const FIXTURE_MODEL = "fixture";

export type TokenUsage = {
  tokensIn: number;
  tokensOut: number;
};

/** Nazwy modeli sa konfiguracja w settings, nie stalymi - zmiana modelu nie wymaga deployu. */
export function pickModel(settings: PipelineSettings, escalate: boolean): string {
  return escalate ? settings.model_escalation : settings.model_default;
}

/** Koszt wywolania w USD. null, gdy model nie ma cennika w settings.model_prices. */
export function computeCostUsd(
  model: string,
  usage: TokenUsage,
  prices: ModelPrices,
): number | null {
  const price = prices[model];
  if (!price) {
    return null;
  }

  const cost =
    (usage.tokensIn * price.input_per_mtok + usage.tokensOut * price.output_per_mtok) / 1_000_000;

  // numeric(10, 6) w llm_calls.cost_usd.
  return Math.round(cost * 1_000_000) / 1_000_000;
}
