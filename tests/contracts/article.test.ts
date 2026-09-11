import { describe, expect, it } from "vitest";
import {
  articleBlockSchema,
  articleContentSchema,
  articleDraftOutputSchema,
  decideAfterQa,
  hasOnlyApprovedFacts,
  isFastTrack,
  qaScoresOutputSchema,
  seoOutputSchema,
  titleCandidatesOutputSchema,
  type ArticleDraftOutput,
  type QaScoresOutput,
} from "@contracts/article.ts";

const FACT_A = "11111111-1111-4111-8111-111111111111";
const FACT_B = "22222222-2222-4222-8222-222222222222";
const IMAGE_ID = "33333333-3333-4333-8333-333333333333";

const thresholds = { qualityThreshold: 0.9, clickbaitThreshold: 0.1 };

const scores: QaScoresOutput = {
  factual_accuracy: 0.97,
  originality: 0.9,
  seo: 0.88,
  clickbait: 0.03,
  quality: 0.93,
  unsupported_claims: 0,
  issues: [],
};

describe("articleBlockSchema", () => {
  it("przyjmuje wszystkie typy blokow", () => {
    const blocks = [
      { type: "paragraph", text: "Tresc akapitu." },
      { type: "heading", level: 2, text: "Srodtytul" },
      { type: "quote", text: "Cytat", attribution: "Trener" },
      { type: "image", imageId: IMAGE_ID, caption: "Podpis" },
      { type: "list", style: "bullet", items: ["Pierwszy", "Drugi"] },
      { type: "fact_box", title: "Fakty", factIds: [FACT_A] },
    ];

    for (const block of blocks) {
      expect(() => articleBlockSchema.parse(block)).not.toThrow();
    }
  });

  it("odrzuca nieznany typ bloku", () => {
    expect(() => articleBlockSchema.parse({ type: "embed", url: "https://x.pl" })).toThrow();
  });

  it("odrzuca naglowek poziomu 1 - ten jest zarezerwowany dla tytulu", () => {
    expect(() => articleBlockSchema.parse({ type: "heading", level: 1, text: "Tytul" })).toThrow();
  });

  it("odrzuca pusty akapit i jednoelementowa liste", () => {
    expect(() => articleBlockSchema.parse({ type: "paragraph", text: "" })).toThrow();
    expect(() =>
      articleBlockSchema.parse({ type: "list", style: "bullet", items: ["Jeden"] }),
    ).toThrow();
  });

  it("wymaga identyfikatora obrazu z biblioteki, nie adresu url", () => {
    expect(() =>
      articleBlockSchema.parse({ type: "image", imageId: "https://cdn.pl/a.jpg" }),
    ).toThrow();
  });
});

describe("articleContentSchema", () => {
  it("wymusza wersje formatu tresci", () => {
    expect(articleContentSchema.parse({ version: 1, blocks: [] }).blocks).toEqual([]);
    expect(() => articleContentSchema.parse({ version: 2, blocks: [] })).toThrow();
  });
});

describe("articleDraftOutputSchema", () => {
  const draft = {
    lead: "Bruno Fernandes przedluzyl kontrakt.",
    blocks: [
      { type: "paragraph", text: "Pierwszy akapit." },
      { type: "paragraph", text: "Drugi akapit." },
      { type: "paragraph", text: "Trzeci akapit." },
    ],
    used_fact_ids: [FACT_A],
    excerpt: "Kontrakt do 2027 roku.",
  };

  it("przyjmuje poprawny szkic", () => {
    expect(articleDraftOutputSchema.parse(draft).used_fact_ids).toEqual([FACT_A]);
  });

  it("wymaga wskazania uzytych faktow", () => {
    expect(() => articleDraftOutputSchema.parse({ ...draft, used_fact_ids: [] })).toThrow();
  });
});

describe("titleCandidatesOutputSchema", () => {
  it("wymaga dokladnie pieciu propozycji", () => {
    const titles = Array.from({ length: 5 }, (_, i) => `Propozycja tytulu numer ${i + 1}`);

    expect(titleCandidatesOutputSchema.parse({ titles }).titles).toHaveLength(5);
    expect(() => titleCandidatesOutputSchema.parse({ titles: titles.slice(0, 4) })).toThrow();
  });

  it("odrzuca tytul dluzszy niz limit", () => {
    const titles = Array.from({ length: 5 }, () => "a".repeat(71));

    expect(() => titleCandidatesOutputSchema.parse({ titles })).toThrow();
  });
});

describe("seoOutputSchema", () => {
  const valid = {
    seo_title: "Bruno Fernandes przedluzyl kontrakt z Manchesterem United",
    seo_description: "a".repeat(140),
    slug: "bruno-fernandes-przedluzyl-kontrakt-manchester-united",
  };

  it("przyjmuje poprawne dane SEO", () => {
    expect(seoOutputSchema.parse(valid).slug).toBe(valid.slug);
  });

  it("pilnuje dlugosci opisu w obie strony", () => {
    expect(() => seoOutputSchema.parse({ ...valid, seo_description: "a".repeat(119) })).toThrow();
    expect(() => seoOutputSchema.parse({ ...valid, seo_description: "a".repeat(166) })).toThrow();
  });

  it("odrzuca slug z wielkimi literami, spacjami i ogonkami", () => {
    expect(() => seoOutputSchema.parse({ ...valid, slug: "Bruno Fernandes" })).toThrow();
    expect(() => seoOutputSchema.parse({ ...valid, slug: "przedluzyl-kontrakt-ł" })).toThrow();
    expect(() => seoOutputSchema.parse({ ...valid, slug: "-zaczyna-sie-myslnikiem" })).toThrow();
  });
});

describe("qaScoresOutputSchema", () => {
  it("odrzuca ujemna liczbe twierdzen bez podparcia", () => {
    expect(qaScoresOutputSchema.parse(scores).unsupported_claims).toBe(0);
    expect(() => qaScoresOutputSchema.parse({ ...scores, unsupported_claims: -1 })).toThrow();
  });
});

describe("decideAfterQa", () => {
  it("blokuje artykul z twierdzeniem bez podparcia w faktach", () => {
    expect(decideAfterQa({ ...scores, unsupported_claims: 1 }, thresholds)).toBe("blocked");
  });

  it("blokuje clickbait powyzej progu", () => {
    expect(decideAfterQa({ ...scores, clickbait: 0.4 }, thresholds)).toBe("blocked");
  });

  it("blokuje tekst niskiej jakosci", () => {
    expect(decideAfterQa({ ...scores, quality: 0.5 }, thresholds)).toBe("blocked");
  });

  it("poprawny tekst kieruje do redaktora, nigdy wprost do publikacji", () => {
    expect(decideAfterQa(scores, thresholds)).toBe("review");
  });
});

describe("isFastTrack", () => {
  it("wymaga jednoczesnie wysokiej jakosci, zera twierdzen bez zrodla i braku clickbaitu", () => {
    expect(isFastTrack(scores, thresholds)).toBe(true);
    expect(isFastTrack({ ...scores, quality: 0.89 }, thresholds)).toBe(false);
    expect(isFastTrack({ ...scores, unsupported_claims: 1 }, thresholds)).toBe(false);
    expect(isFastTrack({ ...scores, clickbait: 0.2 }, thresholds)).toBe(false);
  });
});

describe("hasOnlyApprovedFacts", () => {
  const draft: ArticleDraftOutput = {
    lead: "Bruno Fernandes przedluzyl kontrakt.",
    blocks: [
      { type: "paragraph", text: "Pierwszy akapit." },
      { type: "paragraph", text: "Drugi akapit." },
      { type: "paragraph", text: "Trzeci akapit." },
    ],
    used_fact_ids: [FACT_A],
    excerpt: "Kontrakt do 2027 roku.",
  };

  it("wykrywa uzycie faktu poza zatwierdzonym zbiorem", () => {
    expect(hasOnlyApprovedFacts(draft, [FACT_A, FACT_B])).toBe(true);
    expect(hasOnlyApprovedFacts(draft, [FACT_B])).toBe(false);
    expect(hasOnlyApprovedFacts(draft, [])).toBe(false);
  });
});
