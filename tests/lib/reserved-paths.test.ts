import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RESERVED_PATH_SEGMENTS, isReservedPathSegment, isValidSlug } from "@/lib/public/paths";

const ROOT = join(import.meta.dirname, "..", "..");

/** Slugi kategorii z `insert into categories (id, name, slug, ...)` w seedzie. */
function seedCategorySlugs(): string[] {
  const seed = readFileSync(join(ROOT, "supabase", "seed.sql"), "utf8");
  const match = /insert into categories \(([^)]*)\) values([\s\S]*?)on conflict/i.exec(seed);
  const [, columnList, valuesBlock] = match ?? [];
  if (!columnList || !valuesBlock) {
    throw new Error("Nie znaleziono insert into categories w supabase/seed.sql");
  }
  const columns = columnList.split(",").map((column) => column.trim());
  const slugIndex = columns.indexOf("slug");
  const tuples = valuesBlock.match(/\(([^()]*)\)/g) ?? [];
  return tuples.map((tuple) => {
    const values = [...tuple.matchAll(/'((?:[^']|'')*)'|(\d+)/g)].map(
      (value) => value[1] ?? value[2],
    );
    const slug = values[slugIndex];
    if (!slug) {
      throw new Error(`Brak sluga w krotce seeda: ${tuple}`);
    }
    return slug;
  });
}

/** Statyczne segmenty pierwszego poziomu w app/, takze wewnatrz grup (nazwa). */
function staticTopLevelSegments(): string[] {
  const appDir = join(ROOT, "app");
  const segments: string[] = [];
  for (const entry of readdirSync(appDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("(")) {
      for (const inner of readdirSync(join(appDir, entry.name), { withFileTypes: true })) {
        if (inner.isDirectory() && !/^[[(_]/.test(inner.name)) segments.push(inner.name);
      }
    } else if (!/^[[_]/.test(entry.name)) {
      segments.push(entry.name);
    }
  }
  return segments;
}

describe("RESERVED_PATH_SEGMENTS", () => {
  it("covers every static top-level segment in app/", () => {
    expect(RESERVED_PATH_SEGMENTS).toEqual(expect.arrayContaining(staticTopLevelSegments()));
  });

  it("does not collide with any category slug from the seed", () => {
    const slugs = seedCategorySlugs();

    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      expect(isValidSlug(slug)).toBe(true);
      expect(isReservedPathSegment(slug)).toBe(false);
    }
  });

  it("recognises reserved segments", () => {
    expect(isReservedPathSegment("admin")).toBe(true);
    expect(isReservedPathSegment("transfery")).toBe(false);
  });
});
