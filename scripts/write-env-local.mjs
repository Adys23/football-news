#!/usr/bin/env node
/**
 * Tworzy .env.local na podstawie dzialajacego lokalnego stacku Supabase.
 *
 * Klucze lokalne sa publicznymi wartosciami demonstracyjnymi Supabase - nie sa
 * tajne, ale plik .env.local i tak nie trafia do repozytorium.
 * Wartosci ustawione wczesniej przez czlowieka (np. OPENAI_API_KEY) sa zachowane.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fail, isSupabaseRunning, run, step } from "./lib/run.mjs";

const ENV_PATH = ".env.local";

const DEFAULTS = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  LLM_ENABLED: "false",
  OPENAI_API_KEY: "",
  REVALIDATE_WEBHOOK_SECRET: "lokalny-sekret-do-zmiany",
};

function parseEnv(content) {
  const result = {};

  for (const line of content.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) {
      result[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  }

  return result;
}

step("Odczyt danych lokalnego stacku Supabase");

if (!isSupabaseRunning()) {
  fail("Lokalny Supabase nie dziala. Uruchom `npm run db:start`.");
}

const status = run("supabase", ["status", "-o", "env"], { stdio: ["ignore", "pipe", "ignore"] });

if (status.code !== 0) {
  fail("Nie udalo sie odczytac `supabase status`.");
}

const supabaseEnv = parseEnv(status.stdout);
const existing = existsSync(ENV_PATH) ? parseEnv(readFileSync(ENV_PATH, "utf8")) : {};

const merged = {
  ...DEFAULTS,
  ...existing,
  NEXT_PUBLIC_SUPABASE_URL: supabaseEnv.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseEnv.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: supabaseEnv.SERVICE_ROLE_KEY,
};

if (!merged.NEXT_PUBLIC_SUPABASE_URL || !merged.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  fail("Brak API_URL lub ANON_KEY w wyjsciu `supabase status`.");
}

const content = [
  "# Plik wygenerowany przez `npm run env:local`. Nie trafia do repozytorium.",
  "# Wartosci pipeline'u (OPENAI_API_KEY) uzupelnij recznie.",
  "",
  ...Object.entries(merged).map(([key, value]) => `${key}=${value}`),
  "",
].join("\n");

writeFileSync(ENV_PATH, content, "utf8");

console.log(`Zapisano ${ENV_PATH} (LLM_ENABLED=${merged.LLM_ENABLED}).`);
