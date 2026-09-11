import { writeFileSync } from "node:fs";
import { fail, run } from "./lib/run.mjs";

const TARGET = "supabase/functions/_shared/contracts/database.types.ts";

const result = run("supabase", ["gen", "types", "typescript", "--local"], {
  capture: true,
  stdio: ["ignore", "pipe", "inherit"],
});

if (result.code !== 0 || result.stdout.trim().length === 0) {
  fail("Nie udalo sie wygenerowac typow. Sprawdz, czy lokalny Supabase dziala (npm run db:start).");
}

// Normalizacja do LF, zeby plik byl identyczny na Windows i w CI.
writeFileSync(TARGET, result.stdout.replace(/\r\n/g, "\n"), "utf8");
console.log(`Zapisano ${TARGET}`);
