import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "supabase/.temp/**",
    // Worktree agentow to osobne checkouty; kazdy lintuje sie u siebie.
    ".claude/worktrees/**",
    // Kod Deno (entrypointy Edge Functions) sprawdzamy deno lint, nie ESLintem.
    "supabase/functions/*/index.ts",
    "supabase/functions/_shared/llm/fixtures/**",
    // Wygenerowane z bazy, nie edytujemy recznie.
    "supabase/functions/_shared/contracts/database.types.ts",
  ]),
  {
    rules: {
      // Zasady z AGENTS.md: bez any, bez cichego wylaczania typow, bez console.log.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 10,
        },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression > TSUnknownKeyword",
          message: "Rzutowanie przez unknown jest zabronione. Uzyj schematu zod.",
        },
      ],
    },
  },
  {
    // Skrypty CLI i hooki dzialaja w konsoli, tam console.log jest na miejscu.
    files: [
      "scripts/**/*.mjs",
      ".cursor/hooks/**/*.mjs",
      ".cursor/skills/**/*.mjs",
      "*.config.mjs",
    ],
    rules: {
      "no-console": "off",
    },
  },
]);

export default eslintConfig;
