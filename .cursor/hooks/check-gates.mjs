import { spawnSync } from "node:child_process";
import { readInput } from "./lib/stdin.mjs";

/**
 * Hook `stop`: nie pozwala zakonczyc pracy z czerwona bramka (AGENTS.md, zasada 13 i 18).
 * Typecheck uruchamiany tylko wtedy, gdy w drzewie sa zmienione pliki TypeScript.
 */
await readInput();

const run = (command, args) =>
  spawnSync([command, ...args].join(" "), {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    encoding: "utf8",
  });

const status = run("git", ["status", "--porcelain"]);
if (status.status !== 0) {
  process.exit(0);
}

const changed = status.stdout
  .split("\n")
  .map((line) => line.slice(3).trim())
  .filter((line) => line.length > 0);

if (changed.length === 0) {
  process.exit(0);
}

const problems = [];
const touchesTs = changed.some((file) => /\.(ts|tsx|mjs)$/.test(file));

if (touchesTs) {
  const typecheck = run("npx", ["--no-install", "tsc", "--noEmit"]);
  if (typecheck.status !== 0) {
    const firstError = (typecheck.stdout || "")
      .split("\n")
      .find((line) => line.includes("error TS"));
    problems.push(`typecheck jest czerwony${firstError ? `: ${firstError.trim()}` : ""}`);
  }
}

const diff = run("git", ["diff", "HEAD", "--unified=0"]);
const addedLines = (diff.stdout || "")
  .split("\n")
  .filter((line) => line.startsWith("+") && !line.startsWith("+++"));

const forbidden = [
  { pattern: /console\.log\(/, label: "console.log" },
  { pattern: /@ts-ignore/, label: "@ts-ignore" },
  { pattern: /\b(it|describe|test)\.skip\(/, label: "pominiety test" },
];

for (const { pattern, label } of forbidden) {
  if (addedLines.some((line) => pattern.test(line))) {
    problems.push(`w zmianach znalazlem ${label} - usun to albo uzasadnij zgodnie z AGENTS.md`);
  }
}

if (problems.length === 0) {
  process.exit(0);
}

console.log(
  JSON.stringify({
    followup_message: [
      "Hook projektu wykryl, ze praca nie spelnia bramek jakosci:",
      ...problems.map((problem) => `- ${problem}`),
      "",
      "Napraw to teraz, a potem potwierdz wynikiem `npm run verify`. Nie koncz zadania z czerwona bramka.",
    ].join("\n"),
  }),
);
