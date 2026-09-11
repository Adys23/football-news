/**
 * Konwencja commitow: typ(zakres): opis
 * Zakresy odpowiadaja modulom z docs/architecture.md.
 */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "refactor", "perf", "test", "docs", "chore", "ci", "db", "prompt", "revert"],
    ],
    "scope-enum": [
      2,
      "always",
      [
        "ingestion",
        "dedup",
        "extraction",
        "validation",
        "generation",
        "qa",
        "editorial",
        "delivery",
        "platform",
        "db",
        "seo",
        "admin",
        "docs",
        "deps",
        "tooling",
      ],
    ],
    "scope-empty": [1, "never"],
    "subject-case": [0],
    "header-max-length": [2, "always", 100],
  },
};

export default config;
