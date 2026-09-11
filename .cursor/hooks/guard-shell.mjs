import { readInput } from "./lib/stdin.mjs";

/**
 * Bramka na komendy powloki wg docs/agent-tooling.md.
 * failClosed: true - przy awarii hooka komenda jest blokowana.
 */
const DENY = [
  {
    test: (c) => /git\s+commit\b/.test(c) && /(--no-verify|\s-n(\s|$))/.test(c),
    reason:
      "Omijanie hooka pre-commit jest zabronione (AGENTS.md, zasada 14). Napraw przyczyne, nie hooka.",
  },
  {
    test: (c) => /git\s+push\b/.test(c) && /(--force\b|--force-with-lease|\s-f(\s|$))/.test(c),
    reason: "Force push jest zabroniony. Historia galezi wspoldzielonych jest nienaruszalna.",
  },
  {
    test: (c) => /git\s+push\b/.test(c) && /(^|\s)(origin\s+)?main(\s|$|:)/.test(c),
    reason: "Push na main jest zabroniony (AGENTS.md, zasada 15). Pracuj na galezi i przez PR.",
  },
  {
    test: (c) => /git\s+push\b/.test(c) && /--no-verify/.test(c),
    reason: "Omijanie hooka pre-push jest zabronione.",
  },
  {
    test: (c) => /supabase\s+db\s+(push|reset)\b/.test(c) && /--linked/.test(c),
    reason: "Migracje na zdalna baze wypycha wylacznie CI. Lokalnie pracuj na supabase db reset.",
  },
];

const ASK = [
  {
    test: (c) => /git\s+reset\s+--hard/.test(c) || /git\s+clean\s+-[a-zA-Z]*f/.test(c),
    reason: "Operacja nieodwracalna - moze usunac niezacommitowana prace.",
  },
  {
    test: (c) => /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b/.test(c),
    reason: "Rekurencyjne usuwanie plikow wymaga potwierdzenia.",
  },
  {
    test: (c) => /\bnpm\s+(i|install|add)\s+(?!$)[^-\s]/.test(c),
    reason: "Nowa zaleznosc wymaga decyzji projektowej (AGENTS.md, sekcja 1).",
  },
  {
    test: (c) =>
      /psql/.test(c) &&
      /(drop\s+(table|schema|database)|truncate|delete\s+from\s+(?![\s\S]*where))/i.test(c),
    reason: "Destrukcyjna operacja SQL poza migracja.",
  },
];

const input = await readInput();
const command = typeof input.command === "string" ? input.command : "";

for (const rule of DENY) {
  if (rule.test(command)) {
    console.log(
      JSON.stringify({
        permission: "deny",
        user_message: `Zablokowano komende: ${rule.reason}`,
        agent_message: `Komenda zablokowana przez hook projektu. ${rule.reason}`,
      }),
    );
    process.exit(0);
  }
}

for (const rule of ASK) {
  if (rule.test(command)) {
    console.log(
      JSON.stringify({
        permission: "ask",
        user_message: `Wymaga potwierdzenia: ${rule.reason}`,
        agent_message: `Hook projektu poprosil uzytkownika o zgode. ${rule.reason}`,
      }),
    );
    process.exit(0);
  }
}

console.log(JSON.stringify({ permission: "allow" }));
