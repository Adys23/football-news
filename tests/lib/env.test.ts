import { describe, expect, it } from "vitest";
import { requireEnv } from "@/lib/env";

describe("requireEnv", () => {
  it("zwraca wartosc, gdy zmienna jest ustawiona", () => {
    expect(requireEnv("TEST_VAR", "wartosc")).toBe("wartosc");
  });

  it("rzuca czytelny blad dla braku i pustej wartosci", () => {
    expect(() => requireEnv("TEST_VAR", undefined)).toThrow(/TEST_VAR/);
    expect(() => requireEnv("TEST_VAR", "   ")).toThrow(/\.env\.example/);
  });
});
