import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fail, isSupabaseRunning, run } from "./run.mjs";

const ENV_PATH = ".env.local";

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

function envFromStatus() {
  const status = run("supabase", ["status", "-o", "env"], { stdio: ["ignore", "pipe", "ignore"] });

  if (status.code !== 0) {
    return {};
  }

  return parseEnv(status.stdout);
}

export function loadLocalEnv() {
  const fromFile = existsSync(ENV_PATH) ? parseEnv(readFileSync(ENV_PATH, "utf8")) : {};
  const fromStatus = isSupabaseRunning() ? envFromStatus() : {};

  return {
    url: fromFile.NEXT_PUBLIC_SUPABASE_URL || fromStatus.API_URL,
    anonKey: fromFile.NEXT_PUBLIC_SUPABASE_ANON_KEY || fromStatus.ANON_KEY,
    serviceRoleKey: fromFile.SUPABASE_SERVICE_ROLE_KEY || fromStatus.SERVICE_ROLE_KEY,
  };
}

export function createLocalServiceClient() {
  if (!isSupabaseRunning()) {
    fail("Lokalny Supabase nie dziala. Uruchom `npm run db:start`.");
  }

  const env = loadLocalEnv();

  if (!env.url || !env.serviceRoleKey) {
    fail("Brak API_URL lub SERVICE_ROLE_KEY. Uruchom `npm run env:local`.");
  }

  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
