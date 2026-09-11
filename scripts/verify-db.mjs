import { readFileSync } from "node:fs";
import { fail, isDockerRunning, isSupabaseRunning, run, step } from "./lib/run.mjs";

/**
 * `supabase db reset` restartuje kontenery, a brama Kong zapamietuje ich stare
 * adresy IP. Drugi i kazdy kolejny reset konczy sie wtedy bledem
 * "Error status 502" na zapytaniu o buckety Storage - mimo ze migracje i seed
 * przeszly poprawnie. Restart bramy przed resetem usuwa ten falszywy alarm.
 */
function restartGateway() {
  let projectId;

  try {
    const config = readFileSync("supabase/config.toml", "utf8");
    projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
  } catch {
    return;
  }

  if (!projectId) {
    return;
  }

  run("docker", ["restart", `supabase_kong_${projectId}`], {
    stdio: ["ignore", "ignore", "ignore"],
  });
}

if (!isDockerRunning()) {
  fail("Docker nie odpowiada. Uruchom Docker Desktop i powtorz.");
}

if (!isSupabaseRunning()) {
  step("Lokalny Supabase nie dziala - uruchamiam");
  if (run("supabase", ["start"]).code !== 0) {
    fail("supabase start nie powiodl sie.");
  }
}

step("supabase db reset (migracje + seed)");
restartGateway();
await new Promise((resolve) => setTimeout(resolve, 5000));

if (run("supabase", ["db", "reset"]).code !== 0) {
  fail("db reset nie powiodl sie. Popraw migracje lub seed.");
}

step("supabase db lint");
if (run("supabase", ["db", "lint", "--level", "error"]).code !== 0) {
  fail("db lint zglosil bledy.");
}

step("supabase test db (pgTAP: RLS, trigger publikacji, kolejka)");
if (run("supabase", ["test", "db"]).code !== 0) {
  fail("Testy bazy nie przeszly. Sprawdz polityki RLS i funkcje kolejki.");
}

step("Regeneracja typow i sprawdzenie zgodnosci");
if (run("node", ["scripts/check-types.mjs"]).code !== 0) {
  fail("Typy nie odpowiadaja schematowi.");
}

console.log("\nBramka bazy danych przeszla.\n");
