import process from "node:process";

export type LlmEnv = {
  /** false = odpowiedzi z fixtures/, bez sieci i bez kosztow. */
  enabled: boolean;
  apiKey: string | null;
  fixturesDir: URL;
};

type EnvSource = Record<string, string | undefined>;

/** Brak LLM_ENABLED oznacza fixtures - wlaczenie platnego API musi byc jawne. */
export function readLlmEnv(env: EnvSource = process.env): LlmEnv {
  return {
    enabled: env.LLM_ENABLED === "true",
    apiKey: env.OPENAI_API_KEY?.trim() || null,
    fixturesDir: new URL("./fixtures/", import.meta.url),
  };
}
