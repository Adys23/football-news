import { describe, expect, it } from "vitest";
import {
  buildSteps,
  EDGE_FUNCTIONS,
  IMPORT_MAP,
  missingEnv,
  parseEnvFile,
  validateProjectRef,
  validateSecrets,
} from "@/scripts/lib/deploy-supabase.mjs";

const REF = "abcdefghijklmnopqrst";

describe("validateProjectRef", () => {
  it("przyjmuje 20 malych liter", () => {
    expect(validateProjectRef(REF)).toBe(REF);
  });

  it("odrzuca brak, zla dlugosc i znaki spoza alfabetu", () => {
    expect(() => validateProjectRef(undefined)).toThrow("Brak --project-ref");
    expect(() => validateProjectRef("abc")).toThrow("Niepoprawny");
    expect(() => validateProjectRef("abcdefghijklmnopqrs;")).toThrow("Niepoprawny");
  });
});

describe("parseEnvFile", () => {
  it("pomija komentarze i puste linie, zdejmuje cudzyslowy", () => {
    const entries = parseEnvFile('# komentarz\n\nLLM_ENABLED=false\nOPENAI_API_KEY="sk-x"\n');
    expect([...entries]).toEqual([
      ["LLM_ENABLED", "false"],
      ["OPENAI_API_KEY", "sk-x"],
    ]);
  });

  it("niepoprawna linia nie ujawnia wartosci", () => {
    expect(() => parseEnvFile("to nie jest=sekret-123")).toThrow(/^(?!.*sekret-123)/);
  });
});

describe("validateSecrets", () => {
  it("komplet sekretow", () => {
    expect(
      validateSecrets(
        new Map([
          ["LLM_ENABLED", "false"],
          ["OPENAI_API_KEY", "sk-x"],
        ]),
      ),
    ).toEqual([]);
  });

  it("brakujace sekrety i zla wartosc LLM_ENABLED", () => {
    expect(validateSecrets(new Map([["LLM_ENABLED", "tak"]]))).toEqual([
      "brak OPENAI_API_KEY",
      "LLM_ENABLED musi byc true albo false",
    ]);
  });

  it("odrzuca zarezerwowane SUPABASE_* i zmienne Next.js", () => {
    const errors = validateSecrets(
      new Map([
        ["LLM_ENABLED", "true"],
        ["OPENAI_API_KEY", "sk-x"],
        ["SUPABASE_SERVICE_ROLE_KEY", "x"],
        ["NEXT_PUBLIC_SITE_URL", "https://example.pl"],
      ]),
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(errors[1]).toContain("NEXT_PUBLIC_SITE_URL");
  });
});

describe("buildSteps", () => {
  it("migracje przed funkcjami, podglad bez potwierdzenia, bez seeda i Vault", () => {
    const steps = buildSteps({ projectRef: REF });
    expect(steps.map((step) => step.title)).toEqual([
      "Polaczenie z projektem",
      "Migracje do wykonania (podglad)",
      "Migracje",
      "Edge Functions",
    ]);
    expect(steps.map((step) => step.confirm)).toEqual([false, false, true, true]);
    expect(steps[1]?.args).toContain("--dry-run");

    const pushes = steps.filter((step) => step.args[1] === "push");
    for (const push of pushes) {
      expect(push.args).toContain("--skip-vault");
      expect(push.args).not.toContain("--include-seed");
    }
  });

  it("funkcje z import map i project ref", () => {
    const deploy = buildSteps({ projectRef: REF, useApi: true }).at(-1)?.args ?? [];
    expect(deploy).toEqual([
      "functions",
      "deploy",
      ...EDGE_FUNCTIONS,
      "--project-ref",
      REF,
      "--import-map",
      IMPORT_MAP,
      "--use-api",
    ]);
  });

  it("sekrety tylko z plikiem, przed wdrozeniem funkcji", () => {
    const steps = buildSteps({ projectRef: REF, secretsFile: "supabase/.env.production" });
    expect(steps.map((step) => step.title).slice(-2)).toEqual([
      "Sekrety Edge Functions",
      "Edge Functions",
    ]);
    expect(steps.at(-2)?.args).toEqual([
      "secrets",
      "set",
      "--env-file",
      "supabase/.env.production",
      "--project-ref",
      REF,
    ]);
  });
});

describe("buildSteps z functionsOnly", () => {
  it("pomija migracje, zostawia sekrety i funkcje", () => {
    const steps = buildSteps({ projectRef: REF, secretsFile: "s.env", functionsOnly: true });
    expect(steps.map((step) => step.title)).toEqual([
      "Polaczenie z projektem",
      "Sekrety Edge Functions",
      "Edge Functions",
    ]);
    expect(steps.some((step) => step.args[1] === "push")).toBe(false);
  });
});

describe("missingEnv", () => {
  it("wymienia brakujace zmienne CLI", () => {
    expect(missingEnv({ SUPABASE_ACCESS_TOKEN: "t" })).toEqual(["SUPABASE_DB_PASSWORD"]);
    expect(missingEnv({ SUPABASE_ACCESS_TOKEN: "t", SUPABASE_DB_PASSWORD: "p" })).toEqual([]);
  });
});
