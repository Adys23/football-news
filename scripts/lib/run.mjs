import { spawnSync } from "node:child_process";
import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";

// Binarki z node_modules maja pierwszenstwo przed globalnymi, zeby `supabase` zawsze bylo
// wersja przypieta w package.json. Inna wersja CLI generuje inne database.types.ts.
const LOCAL_BIN = fileURLToPath(new URL("../../node_modules/.bin", import.meta.url));

/**
 * Uruchamia komende przez powloke. Argumenty sklejamy w jeden ciag, bo mieszanie
 * `shell: true` z tablica argumentow jest w Node oznaczone jako niebezpieczne.
 * Wszystkie wywolania w tym repo sa statyczne - nie ma tu danych od uzytkownika.
 */
export function run(command, args = [], options = {}) {
  const { capture = false, stdio, ...rest } = options;
  const line = [command, ...args].join(" ");

  const result = spawnSync(line, {
    stdio: stdio ?? (capture ? ["ignore", "pipe", "inherit"] : "inherit"),
    shell: true,
    encoding: "utf8",
    env: { ...process.env, PATH: `${LOCAL_BIN}${delimiter}${process.env.PATH ?? ""}` },
    ...rest,
  });

  if (result.error) {
    return { code: 1, stdout: "", error: result.error.message };
  }

  return { code: result.status ?? 1, stdout: result.stdout ?? "" };
}

export function fail(message) {
  console.error(`\n[BLAD] ${message}\n`);
  process.exit(1);
}

export function step(message) {
  console.log(`\n=== ${message} ===`);
}

export function isDockerRunning() {
  const result = run("docker", ["info", "--format", '"{{.ServerVersion}}"'], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.code === 0 && result.stdout.trim().length > 0;
}

export function isSupabaseRunning() {
  const result = run("supabase", ["status", "-o", "env"], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.code === 0 && result.stdout.includes("API_URL");
}
