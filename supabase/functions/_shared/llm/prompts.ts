import { readFile } from "node:fs/promises";
import { sha256Hex } from "../lib/hash.ts";
import { JobError } from "../lib/jobs.ts";

export type LoadedPrompt = {
  name: string;
  system: string;
  /** Zapisywane w llm_calls.prompt_version i articles.prompt_version. */
  version: string;
};

const PROMPT_NAME = /^\d{2}-[a-z0-9-]+$/;

const DEFAULT_PROMPTS_DIR = new URL("../prompts/", import.meta.url);

/** Prompt to plik .md w _shared/prompts/, nie string w kodzie. */
export async function loadPrompt(
  name: string,
  dir: URL = DEFAULT_PROMPTS_DIR,
): Promise<LoadedPrompt> {
  if (!PROMPT_NAME.test(name)) {
    throw new JobError(`Nieprawidlowa nazwa promptu: ${name}.`);
  }

  let system: string;
  try {
    system = await readFile(new URL(`${name}.md`, dir), "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "nieznany blad";
    throw new JobError(`Nie udalo sie wczytac promptu ${name}: ${message}`);
  }

  return { name, system, version: (await sha256Hex(system)).slice(0, 12) };
}
