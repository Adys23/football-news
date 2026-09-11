import { describe, expect, it } from "vitest";
import { factExtractionOutputSchema, factExtractionSourceSchema } from "@contracts/facts.ts";

const validOutput = {
  event_type: "transfer",
  entities: [
    { type: "player", name: "Bruno Fernandes" },
    { type: "club", name: "Manchester United" },
  ],
  facts: [
    {
      subject: "Bruno Fernandes",
      predicate: "contract_extension",
      object: "Manchester United",
      statement_pl: "Bruno Fernandes przedluzyl kontrakt z Manchesterem United do 2027 roku.",
      value: { contract_until: "2027-06-30" },
      confidence: 0.95,
      source_indexes: [1],
    },
  ],
  unclear: ["Wysokosc nowego wynagrodzenia"],
};

describe("factExtractionOutputSchema", () => {
  it("przyjmuje poprawne wyjscie etapu ekstrakcji", () => {
    expect(factExtractionOutputSchema.parse(validOutput).facts).toHaveLength(1);
  });

  it("uzupelnia puste unclear, gdy model go nie zwroci", () => {
    const { unclear, ...withoutUnclear } = validOutput;

    expect(unclear).toBeDefined();
    expect(factExtractionOutputSchema.parse(withoutUnclear).unclear).toEqual([]);
  });

  it("dopuszcza historie bez faktow - to sygnal, nie blad", () => {
    expect(factExtractionOutputSchema.parse({ ...validOutput, facts: [] }).facts).toEqual([]);
  });

  it("odrzuca confidence poza zakresem 0-1", () => {
    const broken = {
      ...validOutput,
      facts: [{ ...validOutput.facts[0], confidence: 1.4 }],
    };

    expect(() => factExtractionOutputSchema.parse(broken)).toThrow();
  });

  it("wymaga wskazania zrodla dla kazdego faktu", () => {
    const broken = {
      ...validOutput,
      facts: [{ ...validOutput.facts[0], source_indexes: [] }],
    };

    expect(() => factExtractionOutputSchema.parse(broken)).toThrow();
  });

  it("odrzuca nieznany typ wydarzenia", () => {
    expect(() =>
      factExtractionOutputSchema.parse({ ...validOutput, event_type: "gossip" }),
    ).toThrow();
  });
});

describe("factExtractionSourceSchema", () => {
  it("wymaga wiarygodnosci i typu zrodla na wejsciu modelu", () => {
    const source = {
      index: 1,
      source: "Manchester United (oficjalna)",
      source_type: "official_club",
      trust_score: 1,
      published_at: "2026-09-11T10:00:00.000Z",
      title: "Bruno Fernandes signs new contract",
      content: "Manchester United is delighted to announce...",
    };

    expect(factExtractionSourceSchema.parse(source).trust_score).toBe(1);
    expect(() => factExtractionSourceSchema.parse({ ...source, trust_score: 2 })).toThrow();
    expect(() => factExtractionSourceSchema.parse({ ...source, source_type: "blog" })).toThrow();
  });

  it("dopuszcza brak daty publikacji", () => {
    const source = {
      index: 1,
      source: "Goal.com",
      source_type: "aggregator",
      trust_score: 0.5,
      published_at: null,
      title: "Transfer news",
      content: "",
    };

    expect(factExtractionSourceSchema.parse(source).published_at).toBeNull();
  });
});
