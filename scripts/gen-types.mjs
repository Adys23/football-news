import { writeFileSync } from "node:fs";
import * as prettier from "prettier";
import { fail, run } from "./lib/run.mjs";

const TARGET = "supabase/functions/_shared/contracts/database.types.ts";

const result = run("supabase", ["gen", "types", "typescript", "--local"], {
  capture: true,
  stdio: ["ignore", "pipe", "inherit"],
});

if (result.code !== 0 || result.stdout.trim().length === 0) {
  fail("Nie udalo sie wygenerowac typow. Sprawdz, czy lokalny Supabase dziala (npm run db:start).");
}

// Od Supabase CLI 2.118 generator oddaje niesformatowany kod. Prettier z configiem repo daje
// czytelny plik i czytelne diffy. Zgodnosc z CI zapewnia wersja CLI przypieta w package.json.
const options = await prettier.resolveConfig(TARGET);
const formatted = await prettier.format(result.stdout.replace(/\r\n/g, "\n"), {
  ...options,
  filepath: TARGET,
});

writeFileSync(TARGET, formatted, "utf8");
console.log(`Zapisano ${TARGET}`);
