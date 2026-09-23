#!/usr/bin/env node
import { existsSync } from "node:fs";

const fixtures = "supabase/functions/_shared/llm/fixtures";
const versions = "supabase/functions/_shared/prompts/versions.ts";

if (!existsSync(fixtures) || !existsSync(versions)) {
  console.log(
    "Ewaluacja promptow wchodzi w etapie 2 roadmapy (fixtures LLM + versions.ts). Teraz nie uruchamiaj pipeline'u na zywym API.",
  );
  process.exit(0);
}

console.log("TODO etap 2: porownaj output fixtures przed i po zmianie promptu.");
