import { describe, expect, it } from "vitest";
import {
  assessmentIsStale,
  assessmentSourceNumbers,
  factStatementsById,
  issuesByBlock,
  parseConflicts,
  parseContent,
  parseIssues,
  checkSeoField,
  reviewFacts,
  safeHttpUrl,
  type ReviewSource,
} from "@/lib/admin/review";

const FACT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const FACT_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const FACT_C = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";

function source(overrides: Partial<ReviewSource>): ReviewSource {
  return {
    sourceItemId: "item-1",
    sourceId: "src-1",
    sourceName: "Serwis",
    sourceType: "major_outlet",
    trustScore: 0.8,
    language: "pl",
    url: "https://example.com/news",
    title: "Material",
    publishedAt: "2026-09-28T08:00:00Z",
    linkedAt: "2026-09-28T08:05:00Z",
    ...overrides,
  };
}

function fact(id: string, overrides: Partial<Parameters<typeof reviewFacts>[0][number]> = {}) {
  return {
    id,
    subject: "Jan Kowalski",
    predicate: "plays_for",
    object: "Lech Poznan",
    statement_pl: "Jan Kowalski gra w Lechu Poznan.",
    confidence: 0.9,
    source_id: "src-1",
    ...overrides,
  };
}

describe("parseContent", () => {
  it("przepuszcza poprawna tresc", () => {
    const result = parseContent({
      version: 1,
      blocks: [
        { type: "paragraph", text: "Akapit." },
        { type: "fact_box", factIds: [FACT_A] },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.content.blocks).toHaveLength(2);
  });

  it("nieznany typ bloku to blad z sciezka, nie wyjatek", () => {
    const result = parseContent({ version: 1, blocks: [{ type: "html", text: "<b>x</b>" }] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]).toMatch(/^blocks\.0/);
  });

  it("zla wersja i null sa bledami", () => {
    expect(parseContent({ version: 2, blocks: [] }).ok).toBe(false);
    expect(parseContent(null).ok).toBe(false);
  });
});

describe("parseIssues i parseConflicts", () => {
  it("pomijaja wpisy spoza schematu, zostawiaja poprawne", () => {
    expect(
      parseIssues([
        { severity: "high", block: 1, message: "Brak zrodla" },
        { severity: "critical", message: "x" },
        "tekst",
      ]),
    ).toEqual([{ severity: "high", block: 1, message: "Brak zrodla" }]);

    expect(
      parseConflicts([
        { description: "Rozne kwoty", source_indexes: [1, 3], severity: "medium" },
        { description: "Jedno zrodlo", source_indexes: [1], severity: "low" },
      ]),
    ).toEqual([{ description: "Rozne kwoty", source_indexes: [1, 3], severity: "medium" }]);
  });

  it("brak danych albo nie-tablica to pusta lista", () => {
    expect(parseIssues(undefined)).toEqual([]);
    expect(parseConflicts({ conflicts: [] })).toEqual([]);
  });
});

describe("issuesByBlock", () => {
  it("przypina uwagi do istniejacych blokow, reszta jest ogolna", () => {
    const { byBlock, general } = issuesByBlock(
      [
        { severity: "low", block: 0, message: "a" },
        { severity: "high", block: 0, message: "b" },
        { severity: "medium", message: "c" },
        { severity: "medium", block: 5, message: "d" },
      ],
      2,
    );
    expect(byBlock.get(0)?.map((issue) => issue.message)).toEqual(["a", "b"]);
    expect(general.map((issue) => issue.message)).toEqual(["c", "d"]);
  });
});

describe("assessmentSourceNumbers", () => {
  it("numeruje jak VALIDATE_FACTS: zaufanie malejaco, potem data publikacji", () => {
    const numbers = assessmentSourceNumbers([
      source({ sourceItemId: "i1", sourceId: "s1", sourceName: "Agregator", trustScore: 0.4 }),
      source({
        sourceItemId: "i2",
        sourceId: "s2",
        sourceName: "Klub",
        trustScore: 1,
        publishedAt: "2026-09-28T10:00:00Z",
      }),
      source({
        sourceItemId: "i3",
        sourceId: "s3",
        sourceName: "Dziennik",
        trustScore: 1,
        publishedAt: "2026-09-28T09:00:00Z",
      }),
    ]);
    expect([...numbers]).toEqual([
      [1, "Dziennik"],
      [2, "Klub"],
      [3, "Agregator"],
    ]);
  });

  it("kazdy material ma swoj numer - konflikt moze wskazac drugi material tego samego zrodla", () => {
    const numbers = assessmentSourceNumbers([
      source({ sourceItemId: "i1", sourceId: "s1", sourceName: "Serwis", trustScore: 0.9 }),
      source({
        sourceItemId: "i2",
        sourceId: "s1",
        sourceName: "Serwis",
        trustScore: 0.9,
        publishedAt: "2026-09-28T09:00:00Z",
      }),
      source({ sourceItemId: "i3", sourceId: "s2", sourceName: "Inny", trustScore: 0.5 }),
    ]);
    expect([...numbers]).toEqual([
      [1, "Serwis"],
      [2, "Serwis"],
      [3, "Inny"],
    ]);
  });
});

describe("assessmentIsStale", () => {
  const assessedAt = "2026-09-28T09:00:00Z";

  it("zrodla dolaczone przed ocena - numeracja aktualna", () => {
    expect(assessmentIsStale(assessedAt, [{ linkedAt: "2026-09-28T08:59:59Z" }])).toBe(false);
  });

  it("zrodlo dolaczone po ocenie - numeracja moze sie przesunac", () => {
    expect(
      assessmentIsStale(assessedAt, [
        { linkedAt: "2026-09-28T08:00:00Z" },
        { linkedAt: "2026-09-28T09:00:01Z" },
      ]),
    ).toBe(true);
  });
});

describe("reviewFacts", () => {
  const sources = [
    source({ sourceId: "src-1", sourceName: "Klub", trustScore: 1 }),
    source({ sourceItemId: "item-2", sourceId: "src-2", sourceName: "Agregator", trustScore: 0.4 }),
  ];

  it("laczy ten sam fakt z roznych zrodel w jeden wiersz z nazwami zrodel", () => {
    const facts = reviewFacts(
      [fact(FACT_A), fact(FACT_B, { source_id: "src-2", confidence: 0.95 })],
      sources,
      [],
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ id: FACT_A, confidence: 0.95, verdict: "rejected" });
    expect(facts[0]?.sourceNames).toEqual(["Klub", "Agregator"]);
  });

  it("zatwierdzony, gdy ocena wskazuje dowolny wiersz grupy", () => {
    const facts = reviewFacts(
      [
        fact(FACT_A),
        fact(FACT_B, { source_id: "src-2" }),
        fact(FACT_C, { predicate: "injured", object: null, statement_pl: "Kontuzja." }),
      ],
      sources,
      [FACT_B],
    );
    expect(facts.map((f) => [f.statement, f.verdict])).toEqual([
      ["Jan Kowalski gra w Lechu Poznan.", "approved"],
      ["Kontuzja.", "rejected"],
    ]);
  });

  it("bez oceny faktow nic nie jest odrzucone", () => {
    expect(reviewFacts([fact(FACT_A)], sources, null).map((f) => f.verdict)).toEqual([
      "unassessed",
    ]);
  });

  it("ocena wskazujaca fakty sprzed ponownej ekstrakcji to brak oceny, nie odrzucenie", () => {
    const facts = reviewFacts(
      [
        fact(FACT_A),
        fact(FACT_C, { predicate: "injured", object: null, statement_pl: "Kontuzja." }),
      ],
      sources,
      [FACT_A, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9"],
    );
    expect(facts.map((f) => f.verdict)).toEqual(["unassessed", "unassessed"]);
  });
});

describe("factStatementsById", () => {
  it("kazdy wiersz faktu prowadzi do swojego zdania", () => {
    const map = factStatementsById([fact(FACT_A), fact(FACT_B, { statement_pl: "Inne." })]);
    expect(map.get(FACT_B)).toBe("Inne.");
    expect(map.get(FACT_C)).toBeUndefined();
  });
});

describe("safeHttpUrl", () => {
  it("przepuszcza tylko http i https", () => {
    expect(safeHttpUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHttpUrl("http://example.com")).toBe("http://example.com");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("nie url")).toBeNull();
  });
});

describe("checkSeoField", () => {
  it("limity pochodza z kontraktu GENERATE_SEO", () => {
    expect(checkSeoField("seo_title", "Tytul")).toEqual({ length: 5, min: 1, max: 70, ok: true });
    expect(checkSeoField("seo_title", "x".repeat(71)).ok).toBe(false);
  });

  it("za krotki opis i brak wartosci nie przechodza", () => {
    expect(checkSeoField("seo_description", "za krotko")).toMatchObject({ min: 120, ok: false });
    expect(checkSeoField("seo_description", null)).toMatchObject({ length: 0, ok: false });
  });
});
