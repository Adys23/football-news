import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "supabase/functions/_shared/lib/**/*.ts",
        "supabase/functions/_shared/contracts/**/*.ts",
        "lib/**/*.ts",
      ],
      exclude: [
        "supabase/functions/_shared/contracts/database.types.ts",
        // Bariera re-eksportow i stale - nie ma tu logiki do przetestowania.
        "supabase/functions/_shared/contracts/index.ts",
        "lib/site.ts",
        // Cienkie opakowania na SDK Supabase. Sprawdza je build i testy e2e panelu,
        // a nie testy jednostkowe - mockowanie ich nie weryfikuje niczego realnego.
        "lib/supabase/**",
      ],
      // Progi wg docs/engineering-standards.md: kod wysokiego ryzyka minimum 80 procent.
      thresholds: {
        "supabase/functions/_shared/lib/**": { lines: 80, functions: 80 },
        "supabase/functions/_shared/contracts/**": { lines: 80, functions: 80 },
      },
    },
  },
  resolve: {
    alias: {
      "@contracts": fileURLToPath(
        new URL("./supabase/functions/_shared/contracts", import.meta.url),
      ),
      "@shared": fileURLToPath(new URL("./supabase/functions/_shared", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
