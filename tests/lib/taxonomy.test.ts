import { describe, expect, it } from "vitest";
import {
  categorySlugForEvent,
  classifyEventType,
  importanceFromTrust,
} from "@shared/lib/taxonomy.ts";

describe("classifyEventType", () => {
  it("rozpoznaje transfer, kontrakt, kontuzje i mecz", () => {
    expect(classifyEventType("Here we go: Kowalski idzie na transfer")).toBe("transfer");
    expect(classifyEventType("Bruno Fernandes przedluzyl kontrakt")).toBe("contract");
    expect(classifyEventType("Lewandowski out for hamstring injury")).toBe("injury");
    expect(classifyEventType("Legia wygrala derby")).toBe("match_result");
    expect(classifyEventType("Trening reprezentacji")).toBe("other");
  });
});

describe("categorySlugForEvent", () => {
  it("mapuje typ i kraj klubu na slug kategorii", () => {
    expect(categorySlugForEvent("transfer", [])).toBe("transfery");
    expect(categorySlugForEvent("other", ["pl"])).toBe("ekstraklasa");
    expect(categorySlugForEvent("contract", ["en"])).toBe("pilka-nozna");
  });
});

describe("importanceFromTrust", () => {
  it("skaluje trust_score do 0-100", () => {
    expect(importanceFromTrust(1)).toBe(100);
    expect(importanceFromTrust(0.85)).toBe(85);
    expect(importanceFromTrust(1.4)).toBe(100);
  });
});
