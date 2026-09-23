import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { HandlerContext } from "../lib/handler-context.ts";
import { JobError } from "../lib/jobs.ts";
import { logInfo } from "../lib/log.ts";
import type { PipelineSettings } from "../lib/settings.ts";
import { readPipelineSettings } from "../lib/settings.ts";
import { readLlmEnv } from "./env.ts";
import type { LlmStage, TokenUsage } from "./models.ts";
import { FIXTURE_MODEL, computeCostUsd, pickModel } from "./models.ts";
import type { LoadedPrompt } from "./prompts.ts";

/**
 * Jedyny punkt wywolania LLM w projekcie. Kazda odpowiedz przechodzi przez
 * schemat zod przed zwroceniem do handlera, a kazda proba zostawia wiersz
 * w llm_calls - rowniez nieudana, bo za nieudane wywolania tez placimy.
 */

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const LLM_TIMEOUT_MS = 90_000;
/** Pierwsza proba plus jedna poprawka z bledem walidacji dolaczonym do wejscia. */
const MAX_ATTEMPTS = 2;

export type LlmCallRequest<T> = {
  stage: LlmStage;
  prompt: LoadedPrompt;
  input: unknown;
  schema: z.ZodType<T>;
  escalate?: boolean;
  storyId?: string | null;
  jobId?: string | null;
  /** Podstawiane w fixture za {{klucz}} - np. UUID faktow znane dopiero w runtime. */
  fixtureVars?: Record<string, string>;
};

export type LlmCallResult<T> = {
  data: T;
  model: string;
  promptVersion: string;
};

type CallLog = {
  model: string;
  usage: TokenUsage | null;
  costUsd: number | null;
  latencyMs: number;
  ok: boolean;
  error: string | null;
};

const responsesApiSchema = z.object({
  output: z.array(
    z.object({
      type: z.string(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    }),
  ),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
});

export async function callLlm<T>(
  request: LlmCallRequest<T>,
  ctx: HandlerContext,
): Promise<LlmCallResult<T>> {
  const env = ctx.llmEnv ?? readLlmEnv();

  if (!env.enabled) {
    return callFixture(request, ctx, env.fixturesDir);
  }

  if (!env.apiKey) {
    throw new JobError("LLM_ENABLED=true, ale brak OPENAI_API_KEY.");
  }

  const settings = await readPipelineSettings(ctx.client);
  await assertBudget(ctx, settings);

  const model = pickModel(settings, request.escalate ?? false);
  let feedback: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const started = Date.now();
    const response: CompletionResponse = await requestCompletion(
      request,
      model,
      env.apiKey,
      feedback,
      ctx,
    );
    const latencyMs = Date.now() - started;

    if (!response.ok) {
      await logCall(ctx, request, {
        model,
        usage: null,
        costUsd: null,
        latencyMs,
        ok: false,
        error: response.error,
      });
      throw new JobError(`${request.stage}: ${response.error}`);
    }

    const costUsd = computeCostUsd(model, response.usage, settings.model_prices);
    if (costUsd === null) {
      logInfo("llm.price_unknown", { model });
    }

    const parsed: ParsedOutput<T> = parseOutput(response.text, request.schema);
    await logCall(ctx, request, {
      model,
      usage: response.usage,
      costUsd,
      latencyMs,
      ok: parsed.ok,
      error: parsed.ok ? null : parsed.error,
    });

    if (parsed.ok) {
      return { data: parsed.data, model, promptVersion: request.prompt.version };
    }

    feedback = parsed.error;
  }

  throw new JobError(
    `${request.stage}: odpowiedz modelu niezgodna ze schematem po ${MAX_ATTEMPTS} probach: ${feedback}`,
  );
}

type CompletionResponse =
  { ok: true; text: string; usage: TokenUsage } | { ok: false; error: string };

async function requestCompletion<T>(
  request: LlmCallRequest<T>,
  model: string,
  apiKey: string,
  feedback: string | null,
  ctx: HandlerContext,
): Promise<CompletionResponse> {
  const input = [{ role: "user", content: JSON.stringify(request.input) }];
  if (feedback) {
    input.push({
      role: "user",
      content: `Poprzednia odpowiedz nie przeszla walidacji: ${feedback}\nZwroc wylacznie JSON zgodny ze schematem.`,
    });
  }

  // Poza try: schemat niemozliwy do opisania w JSON Schema to blad w kodzie, nie w sieci.
  const body = JSON.stringify({
    model,
    instructions: request.prompt.system,
    input,
    text: {
      format: {
        type: "json_schema",
        name: `${request.stage}_output`,
        schema: toResponseSchema(request.schema),
        // Schematy maja pola opcjonalne i domyslne, ktorych tryb strict nie przyjmuje.
        // Pelna walidacja i tak jest po naszej stronie, w zod.
        strict: false,
      },
    },
  });

  const fetchImpl = ctx.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "nieznany blad sieci";
    return { ok: false, error: `blad sieci: ${message}` };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return { ok: false, error: `HTTP ${response.status}: ${body.slice(0, 300)}` };
  }

  const parsed = responsesApiSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    return { ok: false, error: "nieoczekiwany format odpowiedzi Responses API" };
  }

  const text = parsed.data.output
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("");

  return {
    ok: true,
    text,
    usage: {
      tokensIn: parsed.data.usage?.input_tokens ?? 0,
      tokensOut: parsed.data.usage?.output_tokens ?? 0,
    },
  };
}

/** JSON Schema dla Responses API. Deklaracja `$schema` spoza obslugiwanego podzbioru jest usuwana. */
export function toResponseSchema(schema: z.ZodType): Record<string, unknown> {
  const json: Record<string, unknown> = { ...z.toJSONSchema(schema, { io: "input" }) };
  delete json.$schema;
  return json;
}

type ParsedOutput<T> = { ok: true; data: T } | { ok: false; error: string };

export function parseOutput<T>(text: string, schema: z.ZodType<T>): ParsedOutput<T> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "odpowiedz nie jest poprawnym JSON" };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    return { ok: false, error: z.prettifyError(result.error).slice(0, 500) };
  }

  return { ok: true, data: result.data };
}

async function callFixture<T>(
  request: LlmCallRequest<T>,
  ctx: HandlerContext,
  fixturesDir: URL,
): Promise<LlmCallResult<T>> {
  let raw: string;
  try {
    raw = await readFile(new URL(`${request.prompt.name}.json`, fixturesDir), "utf8");
  } catch {
    throw new JobError(`Brak fixture LLM dla promptu ${request.prompt.name}.`);
  }

  const parsed = parseOutput(fillFixture(raw, request.fixtureVars ?? {}), request.schema);
  await logCall(ctx, request, {
    model: FIXTURE_MODEL,
    usage: { tokensIn: 0, tokensOut: 0 },
    costUsd: 0,
    latencyMs: 0,
    ok: parsed.ok,
    error: parsed.ok ? null : parsed.error,
  });

  if (!parsed.ok) {
    throw new JobError(`Fixture ${request.prompt.name} niezgodna ze schematem: ${parsed.error}`);
  }

  return { data: parsed.data, model: FIXTURE_MODEL, promptVersion: request.prompt.version };
}

/** Podstawia {{klucz}} wartoscia zakodowana jak string JSON. Brak wartosci to blad fixture. */
export function fillFixture(raw: string, vars: Record<string, string>): string {
  return raw.replace(/\{\{([a-z0-9_]+)\}\}/g, (_match, key: string) => {
    const value = vars[key];
    if (value === undefined) {
      throw new JobError(`Fixture LLM: brak wartosci dla {{${key}}}.`);
    }

    return JSON.stringify(value).slice(1, -1);
  });
}

async function assertBudget(ctx: HandlerContext, settings: PipelineSettings): Promise<void> {
  const now = ctx.now ?? new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const { data, error } = await ctx.client
    .from("llm_calls")
    .select("cost_usd")
    .gte("created_at", dayStart.toISOString());

  if (error) {
    throw new JobError(`Odczyt kosztow llm_calls: ${error.message}`);
  }

  const spent = (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  if (spent >= settings.daily_llm_budget_usd) {
    throw new JobError(
      `Dzienny budzet LLM wyczerpany: ${spent.toFixed(4)} z ${settings.daily_llm_budget_usd} USD.`,
    );
  }
}

async function logCall<T>(
  ctx: HandlerContext,
  request: LlmCallRequest<T>,
  log: CallLog,
): Promise<void> {
  const { error } = await ctx.client.from("llm_calls").insert({
    job_id: request.jobId ?? null,
    story_id: request.storyId ?? null,
    stage: request.stage,
    model: log.model,
    prompt_version: request.prompt.version,
    tokens_in: log.usage?.tokensIn ?? null,
    tokens_out: log.usage?.tokensOut ?? null,
    cost_usd: log.costUsd,
    latency_ms: log.latencyMs,
    ok: log.ok,
    error: log.error,
  });

  if (error) {
    throw new JobError(`Zapis llm_calls: ${error.message}`);
  }
}
