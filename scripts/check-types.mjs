#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fail, run } from "./lib/run.mjs";

const TYPES = "supabase/functions/_shared/contracts/database.types.ts";

/**
 * Porownuje plik w working tree z tym, co wlasnie wygeneruje lokalna baza.
 * Swiadomie nie uzywamy `git diff` vs HEAD: niescommitowane, ale juz
 * zaktualizowane typy nie sa bledem - bledem jest rozjazd generatora z plikiem.
 */
const before = readFileSync(TYPES, "utf8");

if (run("node", ["scripts/gen-types.mjs"]).code !== 0) {
  fail("Generowanie typow nie powiodlo sie.");
}

const after = readFileSync(TYPES, "utf8");

if (before !== after) {
  fail(
    `${TYPES} nie odpowiada migracjom. Zostaw wygenerowany plik i zacommituj go razem ze zmiana schematu.`,
  );
}

console.log("Typy bazy sa zgodne z lokalnym schematem.");
