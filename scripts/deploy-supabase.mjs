#!/usr/bin/env node
/**
 * Wdrozenie bazy i Edge Functions na projekt Supabase Cloud (docs/deployment.md).
 * Kolejnosc: link -> podglad migracji -> db push -> sekrety funkcji -> functions deploy.
 *
 *   SUPABASE_ACCESS_TOKEN=... SUPABASE_DB_PASSWORD=... \
 *     npm run deploy:supabase -- --project-ref=<ref>                 # link + podglad migracji
 *   npm run deploy:supabase -- --project-ref=<ref> --yes           # pelne wdrozenie
 *   npm run deploy:supabase -- --project-ref=<ref> --yes --secrets-file=supabase/.env.production
 *   npm run deploy:supabase -- --project-ref=<ref> --dry-run       # tylko wypisz komendy
 *
 *   npm run deploy:supabase -- --project-ref=<ref> --functions-only --yes  # wycofanie funkcji
 *
 * Bez --yes skrypt konczy sie po podgladzie migracji i niczego nie zmienia na produkcji.
 * Nie ustawia sekretow Vault (webhook publikacji, cron) ani nie wlacza harmonogramow -
 * to SQL z sekretami, wykonywany recznie wedlug docs/deployment.md.
 * Nie uruchamia seeda: zawiera lokalne konta z haslami.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  buildSteps,
  missingEnv,
  parseEnvFile,
  validateProjectRef,
  validateSecrets,
} from "./lib/deploy-supabase.mjs";
import { fail, step } from "./lib/run.mjs";

// CLI przypiete w package.json, jak w pozostalych skryptach (AGENTS.md §2).
const LOCAL_BIN = fileURLToPath(new URL("../node_modules/.bin", import.meta.url));

const { values } = parseArgs({
  options: {
    "project-ref": { type: "string" },
    "secrets-file": { type: "string" },
    "use-api": { type: "boolean", default: false },
    "functions-only": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
  },
});

let projectRef;
try {
  projectRef = validateProjectRef(values["project-ref"]);
} catch (error) {
  fail(error.message);
}

const secretsFile = values["secrets-file"] ?? null;
if (secretsFile) {
  if (!existsSync(secretsFile)) {
    fail(`Plik sekretow nie istnieje: ${secretsFile}`);
  }

  let errors;
  try {
    errors = validateSecrets(parseEnvFile(readFileSync(secretsFile, "utf8")));
  } catch (error) {
    fail(error.message);
  }
  if (errors.length > 0) {
    fail(`Plik sekretow ${secretsFile} nie przeszedl walidacji:\n  - ${errors.join("\n  - ")}`);
  }
}

const steps = buildSteps({
  projectRef,
  secretsFile,
  useApi: values["use-api"],
  functionsOnly: values["functions-only"],
});

if (values["dry-run"]) {
  console.log("Tryb --dry-run: komendy, ktore wykona skrypt z --yes:\n");
  for (const { title, args } of steps) {
    console.log(`# ${title}\nsupabase ${args.join(" ")}\n`);
  }
  process.exit(0);
}

const missing = missingEnv(process.env);
if (missing.length > 0) {
  fail(
    `Brak zmiennych srodowiskowych: ${missing.join(", ")}. Token: supabase.com/dashboard/account/tokens, haslo bazy: Project Settings -> Database.`,
  );
}

// Bez powloki: argumenty ida do procesu wprost, wiec sciezka pliku sekretow
// nie jest interpretowana przez shell.
function supabase(args) {
  const result = spawnSync("supabase", args, {
    stdio: "inherit",
    env: { ...process.env, PATH: `${LOCAL_BIN}${delimiter}${process.env.PATH ?? ""}` },
  });
  return result.error ? 1 : (result.status ?? 1);
}

for (const { title, args, confirm } of steps) {
  if (confirm && !values.yes) {
    console.log(
      "\nPodglad zakonczony. Sprawdz liste migracji powyzej i uruchom ponownie z --yes, zeby wdrozyc.",
    );
    process.exit(0);
  }

  step(title);
  if (supabase(args) !== 0) {
    fail(`Krok "${title}" nie powiodl sie. Kolejne kroki pominiete.`);
  }
}

console.log(
  "\nWdrozenie Supabase zakonczone. Dalsze kroki (Vault, cron, Auth URL, smoke): docs/deployment.md.\n",
);
