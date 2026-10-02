/**
 * Czysta logika `scripts/deploy-supabase.mjs`: walidacja wejscia i lista krokow.
 * Bez procesow i bez sieci, zeby dalo sie ja testowac jednostkowo.
 */

/** Edge Functions wdrazane na produkcje (pg_cron woła obie, patrz migracja 0029). */
export const EDGE_FUNCTIONS = Object.freeze(["fetch-sources", "process-jobs"]);

/** Import map Edge Functions, ten sam co lokalnie (AGENTS.md §3). */
export const IMPORT_MAP = "supabase/functions/deno.json";

/** Sekrety Edge Functions, ktore musi zawierac plik z --secrets-file. */
export const REQUIRED_SECRETS = Object.freeze(["LLM_ENABLED", "OPENAI_API_KEY"]);

/** Project ref Supabase: 20 malych liter (subdomena <ref>.supabase.co). */
export function validateProjectRef(ref) {
  if (!ref) {
    throw new Error("Brak --project-ref.");
  }
  if (!/^[a-z]{20}$/.test(ref)) {
    throw new Error(`Niepoprawny --project-ref: "${ref}". Oczekiwane 20 malych liter.`);
  }
  return ref;
}

/** Klucze i wartosci z pliku w formacie .env (bez komentarzy i pustych linii). */
export function parseEnvFile(content) {
  const entries = new Map();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!match) {
      throw new Error(`Niepoprawna linia w pliku sekretow: "${line.split("=")[0]}..."`);
    }

    entries.set(match[1], match[2].trim().replace(/^(["'])(.*)\1$/, "$2"));
  }

  return entries;
}

/**
 * Sprawdza plik sekretow dla `supabase secrets set --env-file`. Zwraca liste bledow.
 * Klucze SUPABASE_* ustawia sam Supabase i CLI ich nie przyjmie, a klucze NEXT_PUBLIC_*
 * oznaczaja pomylony plik (.env.local aplikacji zamiast sekretow funkcji).
 */
export function validateSecrets(entries) {
  const errors = [];

  for (const key of REQUIRED_SECRETS) {
    if (!entries.has(key) || entries.get(key) === "") {
      errors.push(`brak ${key}`);
    }
  }

  const llmEnabled = entries.get("LLM_ENABLED");
  if (llmEnabled !== undefined && llmEnabled !== "" && !["true", "false"].includes(llmEnabled)) {
    errors.push("LLM_ENABLED musi byc true albo false");
  }

  for (const key of entries.keys()) {
    if (key.startsWith("SUPABASE_")) {
      errors.push(`${key}: zmienne SUPABASE_* ustawia Supabase, nie wolno ich nadpisywac`);
    }
    if (key.startsWith("NEXT_PUBLIC_")) {
      errors.push(`${key}: to zmienna aplikacji Next.js, nie sekret Edge Functions`);
    }
  }

  return errors;
}

/**
 * `--skip-vault`: sekrety Vault (webhook, cron) zakladamy recznie SQL-em na produkcji,
 * a `db push` domyslnie nadpisalby je wartosciami z lokalnego config.toml.
 * Bez `--include-seed`: seed zawiera lokalne konta z haslami.
 *
 * Kroki wdrozenia w kolejnosci: migracje przed sekretami i funkcjami, bo nowy kod funkcji moze
 * zalezec od nowego schematu (docs/deployment.md). Kazdy krok to argumenty CLI supabase.
 * `confirm: true` oznacza krok zmieniajacy produkcje, wymagajacy --yes.
 *
 * `functionsOnly` pomija migracje. Sluzy do wycofania funkcji: checkout starszego commita
 * nie ma migracji juz wykonanych na produkcji i `db push` by sie na tym zatrzymal.
 *
 * @param {{ projectRef: string, secretsFile?: string | null, useApi?: boolean, functionsOnly?: boolean }} options
 */
export function buildSteps({
  projectRef,
  secretsFile = null,
  useApi = false,
  functionsOnly = false,
}) {
  const deploy = ["functions", "deploy", ...EDGE_FUNCTIONS, "--project-ref", projectRef];
  deploy.push("--import-map", IMPORT_MAP);
  if (useApi) {
    deploy.push("--use-api");
  }

  const steps = [
    {
      title: "Polaczenie z projektem",
      args: ["link", "--project-ref", projectRef],
      confirm: false,
    },
  ];

  if (!functionsOnly) {
    steps.push(
      {
        title: "Migracje do wykonania (podglad)",
        args: ["db", "push", "--linked", "--skip-vault", "--dry-run"],
        confirm: false,
      },
      { title: "Migracje", args: ["db", "push", "--linked", "--skip-vault"], confirm: true },
    );
  }

  // Sekrety przed funkcjami: nowa wersja funkcji startuje juz z docelowym LLM_ENABLED.
  if (secretsFile) {
    steps.push({
      title: "Sekrety Edge Functions",
      args: ["secrets", "set", "--env-file", secretsFile, "--project-ref", projectRef],
      confirm: true,
    });
  }

  steps.push({ title: "Edge Functions", args: deploy, confirm: true });

  return steps;
}

/** Zmienne srodowiskowe wymagane przez CLI przy wdrozeniu bez logowania interaktywnego. */
export function missingEnv(env) {
  return ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD"].filter((key) => !env[key]);
}
