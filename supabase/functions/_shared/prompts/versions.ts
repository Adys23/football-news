/**
 * Rejestr wersji promptow z _shared/prompts/*.md.
 *
 * `hash` to wersja zapisywana w llm_calls.prompt_version i articles.prompt_version
 * (12 znakow sha256 tresci pliku). Test tests/llm/prompts.test.ts porownuje go
 * z plikiem, wiec zmiana promptu bez podbicia `version` i `hash` nie przejdzie CI.
 */
export const PROMPT_VERSIONS = {
  "01-extract-facts": { version: 1, hash: "042036fa4f56" },
  "02-assess-facts": { version: 1, hash: "f78bde74f713" },
  "03-write-article": { version: 1, hash: "1c82ecce701b" },
  "04-generate-titles": { version: 1, hash: "194be30ce5e1" },
  "05-select-title": { version: 1, hash: "445d07e6f7d3" },
  "06-qa-check": { version: 1, hash: "66c041927ee5" },
  "07-generate-seo": { version: 1, hash: "f1e129046d9b" },
} as const satisfies Record<string, { version: number; hash: string }>;

export type PromptName = keyof typeof PROMPT_VERSIONS;
