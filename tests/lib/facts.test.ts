import { describe, expect, it } from "vitest";
import type { FactExtractionOutput } from "@contracts/facts.ts";
import type { StorySourceRow } from "@shared/lib/facts.ts";
import type { FactRow } from "@shared/lib/facts.ts";
import {
  MAX_SOURCE_CONTENT_CHARS,
  buildExtractionInput,
  factRowsFromExtraction,
  groupFacts,
  itemSetKey,
  shouldEscalateExtraction,
  shouldEscalateValidation,
} from "@shared/lib/facts.ts";

const STORY_ID = "11111111-1111-4111-8111-111111111111";

function source(id: string, overrides: Partial<StorySourceRow> = {}): StorySourceRow {
  return {
    sourceItemId: `item-${id}`,
    sourceId: `source-${id}`,
    sourceName: `Zrodlo ${id}`,
    sourceType: "major_outlet",
    trustScore: 0.85,
    language: "pl",
    publishedAt: "2025-01-01T12:00:00+00:00",
    title: `Tytul ${id}`,
    content: `Tresc ${id}`,
    ...overrides,
  };
}

function fact(
  overrides: Partial<FactExtractionOutput["facts"][number]>,
): FactExtractionOutput["facts"][number] {
  return {
    subject: "Manchester United",
    predicate: "extended_contract_with",
    object: "Bruno Fernandes",
    statement_pl: "Manchester United przedluzyl kontrakt z Bruno Fernandesem.",
    value: null,
    confidence: 0.9,
    source_indexes: [1],
    ...overrides,
  };
}

function output(facts: FactExtractionOutput["facts"]): FactExtractionOutput {
  return {
    event_type: "contract",
    entities: [{ type: "player", name: "Bruno Fernandes" }],
    facts,
    unclear: [],
  };
}

describe("buildExtractionInput", () => {
  it("indeksuje zrodla od najbardziej wiarygodnego, potem od najwczesniejszego", () => {
    const { input, sourceMap } = buildExtractionInput([
      source("a", { trustScore: 0.7 }),
      source("b", { trustScore: 1, sourceType: "official_club" }),
      source("c", { trustScore: 0.7, publishedAt: "2025-01-01T11:00:00+00:00" }),
    ]);

    expect(input.sources.map((s) => [s.index, s.source])).toEqual([
      [1, "Zrodlo b"],
      [2, "Zrodlo c"],
      [3, "Zrodlo a"],
    ]);
    expect(sourceMap.get(1)).toEqual({ sourceId: "source-b", sourceItemId: "item-b" });
  });

  it("skraca tresc, normalizuje date do ISO z Z i zamienia brak tresci na pusty tekst", () => {
    const { input } = buildExtractionInput([
      source("a", { content: "x".repeat(MAX_SOURCE_CONTENT_CHARS + 50) }),
      source("b", { content: null, publishedAt: null, trustScore: 0.5 }),
    ]);

    expect(input.sources[0]?.content).toHaveLength(MAX_SOURCE_CONTENT_CHARS);
    expect(input.sources[0]?.published_at).toBe("2025-01-01T12:00:00.000Z");
    expect(input.sources[1]).toMatchObject({ content: "", published_at: null });
  });
});

describe("shouldEscalateExtraction", () => {
  it("eskaluje powyzej 4 zrodel albo przy kilku jezykach", () => {
    const four = ["a", "b", "c", "d"].map((id) => source(id));

    expect(shouldEscalateExtraction(four)).toBe(false);
    expect(shouldEscalateExtraction([...four, source("e")])).toBe(true);
    expect(shouldEscalateExtraction([source("a"), source("b", { language: "en" })])).toBe(true);
  });
});

describe("factRowsFromExtraction", () => {
  const { sourceMap } = buildExtractionInput([
    source("a", { trustScore: 1 }),
    source("b", { trustScore: 0.9 }),
  ]);

  it("zapisuje jeden wiersz na pare fakt-zrodlo", () => {
    const rows = factRowsFromExtraction(
      output([fact({ source_indexes: [1, 2] })]),
      sourceMap,
      STORY_ID,
      0.6,
    );

    expect(rows.map((row) => [row.source_id, row.source_item_id])).toEqual([
      ["source-a", "item-a"],
      ["source-b", "item-b"],
    ]);
    expect(rows[0]).toMatchObject({ story_id: STORY_ID, confidence: 0.9 });
  });

  it("odrzuca fakty ponizej progu i indeksy spoza wejscia", () => {
    const rows = factRowsFromExtraction(
      output([
        fact({ confidence: 0.59, predicate: "rumoured" }),
        fact({ source_indexes: [3] }),
        fact({ predicate: "contract_until", source_indexes: [2, 7] }),
      ]),
      sourceMap,
      STORY_ID,
      0.6,
    );

    expect(rows.map((row) => [row.predicate, row.source_id])).toEqual([
      ["contract_until", "source-b"],
    ]);
  });

  it("nie duplikuje faktu powtorzonego przez model dla tego samego zrodla", () => {
    const rows = factRowsFromExtraction(
      output([fact({}), fact({ statement_pl: "Inne sformulowanie." })]),
      sourceMap,
      STORY_ID,
      0.6,
    );

    expect(rows).toHaveLength(1);
  });
});

describe("itemSetKey", () => {
  it("nie zalezy od kolejnosci ani powtorzen, zalezy od skladu", async () => {
    const key = await itemSetKey(["b", "a"]);

    expect(await itemSetKey(["a", "b", "a"])).toBe(key);
    expect(await itemSetKey(["a", "b", "c"])).not.toBe(key);
    expect(key).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("groupFacts", () => {
  const trust = new Map([
    ["club", 1],
    ["outlet", 0.85],
  ]);

  function row(id: string, overrides: Partial<FactRow> = {}): FactRow {
    return {
      id,
      subject: "Manchester United",
      predicate: "extended_contract_with",
      object: "Bruno Fernandes",
      statement_pl: "Manchester United przedluzyl kontrakt z Bruno Fernandesem.",
      confidence: 0.9,
      source_id: "outlet",
      ...overrides,
    };
  }

  it("laczy wiersze tego samego faktu i wybiera wiersz z najbardziej wiarygodnego zrodla", () => {
    const [group, ...rest] = groupFacts(
      [row("b"), row("a", { source_id: "club", confidence: 0.97 })],
      trust,
    );

    expect(rest).toEqual([]);
    expect(group).toMatchObject({ id: "a", confidence: 0.97 });
    expect(group?.sources).toEqual([
      { sourceId: "outlet", trustScore: 0.85 },
      { sourceId: "club", trustScore: 1 },
    ]);
  });

  it("sortuje od najpewniejszego faktu - od tego zaleza placeholdery fixtures", () => {
    const groups = groupFacts(
      [
        row("x", { predicate: "contract_until", confidence: 0.8, statement_pl: "Umowa do 2027." }),
        row("y", { confidence: 0.95 }),
      ],
      trust,
    );

    expect(groups.map((group) => group.id)).toEqual(["y", "x"]);
  });
});

describe("shouldEscalateValidation", () => {
  const group = {
    id: "a",
    subject: "Arsenal",
    predicate: "transfer_fee",
    object: "12 mln EUR",
    statement_pl: "Arsenal zaplaci 12 mln EUR.",
    confidence: 0.9,
    sources: [],
  };

  it("eskaluje przy niskiej pewnosci i przy sprzecznych dopelnieniach", () => {
    expect(shouldEscalateValidation([group], 0.8)).toBe(false);
    expect(shouldEscalateValidation([{ ...group, confidence: 0.7 }], 0.8)).toBe(true);
    expect(shouldEscalateValidation([group, { ...group, id: "b", object: "9 mln EUR" }], 0.8)).toBe(
      true,
    );
  });
});
