import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { collectStrings, readInput } from "./lib/stdin.mjs";

/** Higiena po edycji pliku: formatowanie plus ostrzezenia o regulach projektu. */
const input = await readInput();

const candidate =
  [input.file_path, input.filePath, input.path].find((value) => typeof value === "string") ??
  collectStrings(input).find((value) => /\.(ts|tsx|mjs|js|json|md|css|sql)$/.test(value));

if (!candidate) {
  process.exit(0);
}

const relative = path.relative(process.cwd(), path.resolve(candidate)).split(path.sep).join("/");

if (relative.startsWith("..") || !existsSync(candidate)) {
  process.exit(0);
}

// Argumenty sklejamy w jeden ciag - Node ostrzega przed shell: true z tablica argumentow.
const run = (command, args) =>
  spawnSync([command, ...args].join(" "), {
    stdio: ["ignore", "ignore", "pipe"],
    shell: true,
    encoding: "utf8",
  });

if (/\.(ts|tsx|mjs|js|json|md|css)$/.test(relative)) {
  run("npx", ["--no-install", "prettier", "--write", "--ignore-unknown", `"${relative}"`]);
}

if (/\.(ts|tsx|mjs)$/.test(relative) && !relative.includes("database.types.ts")) {
  run("npx", ["--no-install", "eslint", "--fix", `"${relative}"`]);
}

const notes = [];

if (relative.startsWith("supabase/migrations/")) {
  const tracked = run("git", ["ls-files", "--error-unmatch", `"${relative}"`]);
  if (tracked.status === 0) {
    notes.push(
      "Ta migracja jest juz wersjonowana. Migracje sa niezmienialne - utworz nowa przez `supabase migration new`.",
    );
  }
  notes.push("Po zmianie schematu uruchom `npm run db:types` i zacommituj database.types.ts.");
  notes.push("Nowa tabela wymaga `alter table ... enable row level security` oraz polityk.");
}

if (relative.includes("_shared/prompts/")) {
  notes.push("Zmiana promptu wymaga podniesienia PROMPT_VERSIONS w _shared/prompts/versions.ts.");
}

if (notes.length > 0) {
  console.error(`\n[hook] ${relative}`);
  for (const note of notes) {
    console.error(`  - ${note}`);
  }
}
