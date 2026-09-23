import { describe, expect, it } from "vitest";
import { MAX_SLUG_LENGTH, uniqueSlug } from "@shared/lib/slug.ts";

describe("uniqueSlug", () => {
  it("zwraca baze, gdy jest wolna, i kolejny numer, gdy jest zajeta", () => {
    expect(uniqueSlug("bruno-fernandes", new Set())).toBe("bruno-fernandes");
    expect(uniqueSlug("bruno-fernandes", new Set(["bruno-fernandes", "bruno-fernandes-2"]))).toBe(
      "bruno-fernandes-3",
    );
  });

  it("miesci sufiks w limicie dlugosci kosztem konca bazy", () => {
    const base = `${"a".repeat(MAX_SLUG_LENGTH - 2)}-b`;

    expect(uniqueSlug(base, new Set([base]))).toBe(`${"a".repeat(MAX_SLUG_LENGTH - 2)}-2`);
  });

  it("nie zostawia podwojnego myslnika, gdy ciecie wypada na myslniku", () => {
    const base = `${"a".repeat(MAX_SLUG_LENGTH - 3)}-bc`;
    const slug = uniqueSlug(base, new Set([base]));

    expect(slug).toBe(`${"a".repeat(MAX_SLUG_LENGTH - 3)}-2`);
    expect(slug).not.toContain("--");
  });
});
