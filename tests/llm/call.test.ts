import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  OPENAI_RESPONSES_URL,
  callLlm,
  fillFixture,
  parseOutput,
  toResponseSchema,
} from "@shared/llm/call.ts";
import type { LlmEnv } from "@shared/llm/env.ts";
import type { LoadedPrompt } from "@shared/llm/prompts.ts";
import type { HandlerContext } from "@shared/lib/handler-context.ts";
import type { ServiceClient } from "@shared/lib/jobs.ts";
import { JobError } from "@shared/lib/jobs.ts";

const STORY_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const schema = z.object({ facts: z.array(z.string()).min(1), note: z.string().default("") });
const prompt: LoadedPrompt = { name: "99-test", system: "Zwroc JSON.", version: "abc123" };

type Inserted = Record<string, unknown>;

/** Minimalny klient: settings, suma kosztow z llm_calls i insert do llm_calls. */
function fakeClient(options: { settings?: { key: string; value: unknown }[]; spent?: number[] }) {
  const inserted: Inserted[] = [];
  // vi.fn() bez sygnatury, bo pelny PostgrestQueryBuilder nie jest tu potrzebny.
  const from = vi.fn();
  from.mockImplementation((table: string) => {
    if (table === "settings") {
      return {
        select: () => ({ in: async () => ({ data: options.settings ?? [], error: null }) }),
      };
    }

    return {
      select: () => ({
        gte: async () => ({
          data: (options.spent ?? []).map((cost) => ({ cost_usd: cost })),
          error: null,
        }),
      }),
      insert: async (row: Inserted) => {
        inserted.push(row);
        return { error: null };
      },
    };
  });

  return { client: { from } as Pick<ServiceClient, "from"> as ServiceClient, inserted };
}

function fixturesDir(files: Record<string, string>): URL {
  const dir = mkdtempSync(path.join(tmpdir(), "llm-fixtures-"));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), body);
  }
  return pathToFileURL(`${dir}${path.sep}`);
}

function liveEnv(): LlmEnv {
  return { enabled: true, apiKey: "sk-test", fixturesDir: fixturesDir({}) };
}

function apiResponse(text: string, usage = { input_tokens: 1000, output_tokens: 500 }): Response {
  return new Response(
    JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text }] }],
      usage,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const PRICES = {
  key: "model_prices",
  value: { "gpt-5.6-luna": { input_per_mtok: 1, output_per_mtok: 6 } },
};

function ctxWith(client: ServiceClient, llmEnv: LlmEnv, fetchImpl?: HandlerContext["fetchImpl"]) {
  return { client, llmEnv, fetchImpl, now: new Date("2026-09-23T12:00:00Z") };
}

describe("callLlm w trybie fixtures", () => {
  it("zwraca fixture po walidacji i loguje wywolanie z kosztem 0", async () => {
    const { client, inserted } = fakeClient({});
    const env: LlmEnv = {
      enabled: false,
      apiKey: null,
      fixturesDir: fixturesDir({ "99-test.json": '{"facts": ["{{fact_0}}"]}' }),
    };
    const fetchImpl = vi.fn();

    const result = await callLlm(
      {
        stage: "extract",
        prompt,
        input: {},
        schema,
        storyId: STORY_ID,
        jobId: JOB_ID,
        fixtureVars: { fact_0: STORY_ID },
      },
      ctxWith(client, env, fetchImpl),
    );

    expect(result).toEqual({
      data: { facts: [STORY_ID], note: "" },
      model: "fixture",
      promptVersion: "abc123",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(inserted).toEqual([
      expect.objectContaining({
        stage: "extract",
        model: "fixture",
        story_id: STORY_ID,
        job_id: JOB_ID,
        prompt_version: "abc123",
        cost_usd: 0,
        ok: true,
      }),
    ]);
  });

  it("brak pliku fixture to JobError", async () => {
    const { client } = fakeClient({});
    const env: LlmEnv = { enabled: false, apiKey: null, fixturesDir: fixturesDir({}) };

    await expect(
      callLlm({ stage: "qa", prompt, input: {}, schema }, ctxWith(client, env)),
    ).rejects.toBeInstanceOf(JobError);
  });

  it("fixture niezgodna ze schematem jest logowana jako blad i rzuca", async () => {
    const { client, inserted } = fakeClient({});
    const env: LlmEnv = {
      enabled: false,
      apiKey: null,
      fixturesDir: fixturesDir({ "99-test.json": '{"facts": []}' }),
    };

    await expect(
      callLlm({ stage: "extract", prompt, input: {}, schema }, ctxWith(client, env)),
    ).rejects.toThrow(/niezgodna ze schematem/);
    expect(inserted[0]).toMatchObject({ ok: false });
  });
});

describe("callLlm z API", () => {
  it("wysyla prompt i schemat, liczy koszt z settings.model_prices", async () => {
    const { client, inserted } = fakeClient({ settings: [PRICES] });
    const fetchImpl = vi.fn().mockResolvedValue(apiResponse('{"facts": ["a"]}'));

    const result = await callLlm(
      { stage: "extract", prompt, input: { sources: [] }, schema },
      ctxWith(client, liveEnv(), fetchImpl),
    );

    expect(result.data).toEqual({ facts: ["a"], note: "" });
    expect(result.model).toBe("gpt-5.6-luna");

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(OPENAI_RESPONSES_URL);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "gpt-5.6-luna",
      instructions: "Zwroc JSON.",
      text: { format: { type: "json_schema", name: "extract_output" } },
    });
    expect(body.input[0].content).toBe('{"sources":[]}');

    // 1000 * 1 / 1e6 + 500 * 6 / 1e6
    expect(inserted).toEqual([
      expect.objectContaining({ tokens_in: 1000, tokens_out: 500, cost_usd: 0.004, ok: true }),
    ]);
  });

  it("eskalacja uzywa model_escalation", async () => {
    const { client } = fakeClient({});
    const fetchImpl = vi.fn().mockResolvedValue(apiResponse('{"facts": ["a"]}'));

    const result = await callLlm(
      { stage: "validate", prompt, input: {}, schema, escalate: true },
      ctxWith(client, liveEnv(), fetchImpl),
    );

    expect(result.model).toBe("gpt-5.6-sol");
  });

  it("po niepoprawnej odpowiedzi ponawia raz z bledem walidacji", async () => {
    const { client, inserted } = fakeClient({});
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(apiResponse('{"facts": []}'))
      .mockResolvedValueOnce(apiResponse('{"facts": ["b"]}'));

    const result = await callLlm(
      { stage: "write", prompt, input: {}, schema },
      ctxWith(client, liveEnv(), fetchImpl),
    );

    expect(result.data.facts).toEqual(["b"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(
      String((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body),
    );
    expect(retryBody.input[1].content).toMatch(/nie przeszla walidacji/);
    expect(inserted.map((row) => row.ok)).toEqual([false, true]);
    // Model bez cennika: koszt nieznany, ale wywolanie i tak jest zapisane.
    expect(inserted[1]).toMatchObject({ cost_usd: null });
  });

  it("dwie niepoprawne odpowiedzi koncza sie JobError", async () => {
    const { client, inserted } = fakeClient({});
    const fetchImpl = vi.fn().mockImplementation(async () => apiResponse("to nie json"));

    await expect(
      callLlm({ stage: "title", prompt, input: {}, schema }, ctxWith(client, liveEnv(), fetchImpl)),
    ).rejects.toThrow(/po 2 probach/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(inserted).toHaveLength(2);
  });

  it("blad HTTP jest logowany i rzuca bez ponowienia", async () => {
    const { client, inserted } = fakeClient({});
    const fetchImpl = vi.fn().mockResolvedValue(new Response("rate limit", { status: 429 }));

    await expect(
      callLlm({ stage: "seo", prompt, input: {}, schema }, ctxWith(client, liveEnv(), fetchImpl)),
    ).rejects.toThrow(/HTTP 429/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(inserted[0]).toMatchObject({ ok: false, tokens_in: null, cost_usd: null });
  });

  it("blad sieci jest logowany jako nieudane wywolanie", async () => {
    const { client, inserted } = fakeClient({});
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    await expect(
      callLlm({ stage: "qa", prompt, input: {}, schema }, ctxWith(client, liveEnv(), fetchImpl)),
    ).rejects.toThrow(/ECONNRESET/);
    expect(inserted[0]).toMatchObject({ ok: false });
  });

  it("nie wola API po przekroczeniu dziennego budzetu", async () => {
    const { client, inserted } = fakeClient({
      settings: [{ key: "daily_llm_budget_usd", value: 1 }],
      spent: [0.6, 0.4],
    });
    const fetchImpl = vi.fn();

    await expect(
      callLlm(
        { stage: "extract", prompt, input: {}, schema },
        ctxWith(client, liveEnv(), fetchImpl),
      ),
    ).rejects.toThrow(/budzet/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it("wymaga klucza API, gdy LLM jest wlaczony", async () => {
    const { client } = fakeClient({});

    await expect(
      callLlm(
        { stage: "extract", prompt, input: {}, schema },
        ctxWith(client, { ...liveEnv(), apiKey: null }),
      ),
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });
});

describe("fillFixture", () => {
  it("podstawia wartosci z escapowaniem JSON", () => {
    expect(fillFixture('{"a": "{{x}}"}', { x: 'cudzy "cytat"' })).toBe(
      '{"a": "cudzy \\"cytat\\""}',
    );
  });

  it("brak wartosci to blad fixture", () => {
    expect(() => fillFixture('{"a": "{{brak}}"}', {})).toThrow(/brak/);
  });
});

describe("toResponseSchema", () => {
  it("usuwa $schema i zostawia opis obiektu", () => {
    const json = toResponseSchema(schema);

    expect(json).not.toHaveProperty("$schema");
    expect(json).toMatchObject({ type: "object", properties: { facts: { type: "array" } } });
  });

  it("schemat nieopisywalny w JSON Schema to blad kodu, nie wywolanie API", async () => {
    const { client, inserted } = fakeClient({});
    const fetchImpl = vi.fn();
    const bad = z.object({ at: z.date() });

    await expect(
      callLlm(
        { stage: "qa", prompt, input: {}, schema: bad },
        ctxWith(client, liveEnv(), fetchImpl),
      ),
    ).rejects.not.toThrow(/blad sieci/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });
});

describe("parseOutput", () => {
  it("rozroznia niepoprawny JSON od niezgodnosci ze schematem", () => {
    expect(parseOutput("{", schema)).toEqual({
      ok: false,
      error: "odpowiedz nie jest poprawnym JSON",
    });
    expect(parseOutput('{"facts": 1}', schema).ok).toBe(false);
  });
});
