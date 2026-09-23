import { describe, expect, it } from "vitest";
import type { ArticleBlock } from "@contracts/article.ts";
import type { ArticleCheckInput } from "@shared/lib/article-checks.ts";
import { articleCheckIssues } from "@shared/lib/article-checks.ts";

const FACT = "11111111-1111-4111-8111-111111111111";
const words = (n: number, seed: string) =>
  Array.from({ length: n }, (_, i) => `${seed}${i}`).join(" ");

function input(overrides: Partial<ArticleCheckInput> = {}): ArticleCheckInput {
  const blocks: ArticleBlock[] = ["a", "b", "c", "d"].map((seed) => ({
    type: "paragraph",
    text: words(70, seed),
  }));
  return {
    title: "Manchester United przedluzyl kontrakt z Bruno Fernandesem",
    lead: "Lead artykulu.",
    blocks: [...blocks, { type: "fact_box", factIds: [FACT] }],
    approvedFactIds: [FACT],
    sourceTexts: ["Zupelnie inna tresc zrodla bez wspolnych fragmentow."],
    knownEntities: ["Bruno Fernandes", "United"],
    ...overrides,
  };
}

describe("articleCheckIssues", () => {
  it("przepuszcza artykul zgodny ze wszystkimi regulami", () => {
    expect(articleCheckIssues(input())).toEqual([]);
  });

  it("zglasza tytul z wykrzyknikiem i bez encji", () => {
    const issues = articleCheckIssues(input({ title: "Nowy kontrakt podpisany w klubie!" }));

    expect(issues).toEqual([
      "Tytul: Wykrzyknik w tytule jest zabroniony.",
      "Tytul: Tytul nie zawiera nazwy zawodnika ani klubu.",
    ]);
  });

  it("zglasza fragment skopiowany ze zrodla, ale nie cytat z atrybucja", () => {
    const copied = "klub potwierdzil ze pomocnik podpisal nowa umowe do 2027 roku";
    const quoteOnly = input({
      sourceTexts: [copied],
      blocks: [...input().blocks, { type: "quote", text: copied, attribution: "Klub" }],
    });
    const inLead = input({ sourceTexts: [copied], lead: `Jak podano, ${copied}.` });

    expect(articleCheckIssues(quoteOnly)).toEqual([]);
    expect(articleCheckIssues(inLead)).toEqual([
      'Fragment skopiowany ze zrodla: "klub potwierdzil ze pomocnik podpisal nowa umowe do".',
      'Fragment skopiowany ze zrodla: "potwierdzil ze pomocnik podpisal nowa umowe do 2027".',
      'Fragment skopiowany ze zrodla: "ze pomocnik podpisal nowa umowe do 2027 roku".',
    ]);
  });

  it("przenosi reguly tresci: fact_box spoza zatwierdzonych i dlugosc", () => {
    expect(articleCheckIssues(input({ approvedFactIds: [] }))).toEqual([
      "fact_box wskazuje fakt spoza zatwierdzonych.",
    ]);
  });
});
