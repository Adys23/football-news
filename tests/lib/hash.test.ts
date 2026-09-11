import { describe, expect, it } from "vitest";
import {
  buildHashInput,
  buildSourceItemHash,
  normalizeTitle,
  sha256Hex,
} from "@shared/lib/hash.ts";

describe("normalizeTitle", () => {
  it("usuwa znaki diakrytyczne, w tym polskie l z kreska", () => {
    expect(normalizeTitle("Robert Lewandowski zagrał w Łodzi")).toBe(
      "robert lewandowski zagral w lodzi",
    );
  });

  it("zwija interpunkcje i wielokrotne odstepy do jednej spacji", () => {
    expect(normalizeTitle("Transfer  OFICJALNIE: Bruno Fernandes -- zostaje!")).toBe(
      "transfer oficjalnie bruno fernandes zostaje",
    );
  });

  it("daje ten sam wynik dla zapisu z roznymi wielkosciami liter i ogonkami", () => {
    expect(normalizeTitle("Legia Warszawa wygrała")).toBe(normalizeTitle("LEGIA WARSZAWA WYGRALA"));
  });

  it("zwraca pusty ciag dla tytulu bez znakow alfanumerycznych", () => {
    expect(normalizeTitle("--- !!! ???")).toBe("");
  });
});

describe("buildHashInput", () => {
  it("rozdziela adres i tytul, zeby uniknac kolizji przez zlepienie", () => {
    expect(buildHashInput("https://a.pl/x", "tytul")).toBe("https://a.pl/x\ntytul");
    expect(buildHashInput("https://a.pl/xtytul", "")).not.toBe(
      buildHashInput("https://a.pl/x", "tytul"),
    );
  });
});

describe("sha256Hex", () => {
  it("zwraca znany skrot dla ustalonego wejscia", async () => {
    await expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("zwraca 64 znaki szesnastkowe", async () => {
    const hash = await sha256Hex("cokolwiek");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("buildSourceItemHash", () => {
  it("ten sam material pobrany dwa razy ma ten sam hash", async () => {
    const first = await buildSourceItemHash("https://legia.com/news/1", "Legia wygrała derby");
    const second = await buildSourceItemHash("https://legia.com/news/1", "LEGIA WYGRALA DERBY");

    expect(first).toBe(second);
  });

  it("inny adres daje inny hash, nawet przy tym samym tytule", async () => {
    const first = await buildSourceItemHash("https://legia.com/news/1", "Legia wygrala derby");
    const second = await buildSourceItemHash("https://legia.com/news/2", "Legia wygrala derby");

    expect(first).not.toBe(second);
  });
});
