import { readFileSync } from "node:fs";
import { run } from "./lib/run.mjs";

/**
 * Skan plikow wersjonowanych na obecnosc sekretow.
 * Uruchamiany przez pre-push oraz przez job security w CI.
 */
const PATTERNS = [
  { name: "klucz OpenAI", regex: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: "JWT (anon/service_role)", regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./ },
  { name: "wypelniony SERVICE_ROLE_KEY", regex: /SERVICE_ROLE_KEY\s*=\s*\S+/ },
  { name: "wypelniony OPENAI_API_KEY", regex: /OPENAI_API_KEY\s*=\s*\S+/ },
  { name: "NEXT_PUBLIC z wrazliwa nazwa", regex: /NEXT_PUBLIC_\w*(SERVICE_ROLE|SECRET|API_KEY)/ },
  { name: "prywatny klucz", regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

const SKIP = [/^package-lock\.json$/, /^scripts\/scan-secrets\.mjs$/, /\.(png|jpg|jpeg|ico|svg)$/];

const listed = run("git", ["ls-files"], { capture: true, stdio: ["ignore", "pipe", "inherit"] });
if (listed.code !== 0) {
  console.error("Nie udalo sie odczytac listy plikow z gita.");
  process.exit(1);
}

const files = listed.stdout
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !SKIP.some((pattern) => pattern.test(line)));

const findings = [];

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  content.split("\n").forEach((line, index) => {
    for (const { name, regex } of PATTERNS) {
      if (regex.test(line)) {
        findings.push({ file, line: index + 1, name });
      }
    }
  });
}

if (findings.length > 0) {
  console.error("\n[BLAD] Wykryto potencjalne sekrety:\n");
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line} - ${finding.name}`);
  }
  console.error("\nUsun sekret z pliku i z historii, zanim wypchniesz zmiany.\n");
  process.exit(1);
}

console.log(`Skan sekretow: czysto (${files.length} plikow).`);
