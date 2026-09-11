import { fail, isDockerRunning, isSupabaseRunning, run, step } from "./lib/run.mjs";

const TYPES = "supabase/functions/_shared/contracts/database.types.ts";

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
if (run("node", ["scripts/gen-types.mjs"]).code !== 0) {
  fail("Generowanie typow nie powiodlo sie.");
}

if (run("git", ["diff", "--exit-code", "--", TYPES]).code !== 0) {
  fail(`${TYPES} nie odpowiada migracjom. Zacommituj wygenerowany plik razem z migracja.`);
}

console.log("\nBramka bazy danych przeszla.\n");
