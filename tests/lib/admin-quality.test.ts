import { describe, expect, it } from "vitest";
import {
  AUTO_PUBLISH_CRITERIA,
  DEFAULT_QUALITY_WINDOW,
  QUALITY_FETCH_DAYS,
  UNCATEGORIZED_LABEL,
  buildCriteriaProgress,
  buildQualityReport,
  classifyEdit,
  daysAgo,
  daysSince,
  formatShare,
  formatUsd,
  listRejections,
  parseQualityWindow,
  share,
  summarize,
  toQualityArticles,
  toQualityTotals,
  type QualityArticle,
  type QualityTotals,
} from "@/lib/admin/quality";

const NOW = new Date("2026-09-29T12:00:00Z");
const CAT_A = "33333333-3333-4333-8333-333333333331";
const CAT_B = "33333333-3333-4333-8333-333333333332";
const CATEGORIES = [
  { id: CAT_A, name: "Transfery" },
  { id: CAT_B, name: "Ekstraklasa" },
];

function ago(days: number): string {
  return daysAgo(NOW, days).toISOString();
}

let seq = 0;
function article(overrides: Partial<QualityArticle>): QualityArticle {
  seq += 1;
  return {
    id: `article-${seq}`,
    title: `Tytul ${seq}`,
    categoryId: CAT_A,
    status: "published",
    publishedAt: ago(1),
    rejectedAt: null,
    rejectReason: null,
    editorRevisions: 0,
    titleEdited: false,
    leadEdited: false,
    contentEdited: false,
    factualAccuracy: null,
    originality: null,
    seo: null,
    clickbait: null,
    quality: null,
    unsupportedClaims: null,
    checkedAt: null,
    ...overrides,
  };
}

function totals(overrides: Partial<QualityTotals>): QualityTotals {
  return {
    categoryId: CAT_A,
    firstPublishedAt: null,
    llmCalls: 0,
    llmCostUsd: null,
    llmUnpricedCalls: 0,
    llmFailedCalls: 0,
    llmEscalatedCalls: 0,
    ...overrides,
  };
}

describe("parseQualityWindow", () => {
  it("przyjmuje tylko 7, 30 i 60", () => {
    expect(parseQualityWindow("7")).toBe(7);
    expect(parseQualityWindow("60")).toBe(60);
    expect(parseQualityWindow(["30", "7"])).toBe(30);
  });

  it("wraca do domyslnego okna przy zlej wartosci", () => {
    for (const value of [undefined, "", "14", "abc", "7.5", "-7"]) {
      expect(parseQualityWindow(value)).toBe(DEFAULT_QUALITY_WINDOW);
    }
  });

  it("pobiera dane z okna obejmujacego kryterium 60 dni", () => {
    expect(QUALITY_FETCH_DAYS).toBe(60);
  });
});

describe("mapowanie wierszy RPC", () => {
  it("waliduje wiersz artykulu i przyjmuje null tam, gdzie baza go zwraca", () => {
    const [mapped] = toQualityArticles([
      {
        article_id: "a1",
        title: "Tytul",
        category_id: null,
        status: "rejected",
        published_at: null,
        rejected_at: "2026-09-20T10:00:00+00:00",
        reject_reason: null,
        editor_revisions: 0,
        title_edited: false,
        lead_edited: false,
        content_edited: false,
        factual_accuracy: null,
        originality: null,
        seo: null,
        clickbait: null,
        quality: 0.8,
        unsupported_claims: null,
        checked_at: null,
      },
    ]);
    expect(mapped).toMatchObject({ id: "a1", categoryId: null, status: "rejected", quality: 0.8 });
  });

  it("odrzuca wiersz o nieznanym statusie", () => {
    expect(() => toQualityArticles([{ article_id: "a1", status: "unknown" }])).toThrow();
  });

  it("mapuje agregaty kosztu", () => {
    const [mapped] = toQualityTotals([
      {
        category_id: null,
        first_published_at: null,
        llm_calls: 3,
        llm_cost_usd: 0.012,
        llm_unpriced_calls: 1,
        llm_failed_calls: 0,
        llm_escalated_calls: 2,
      },
    ]);
    expect(mapped).toEqual({
      categoryId: null,
      firstPublishedAt: null,
      llmCalls: 3,
      llmCostUsd: 0.012,
      llmUnpricedCalls: 1,
      llmFailedCalls: 0,
      llmEscalatedCalls: 2,
    });
  });
});

describe("classifyEdit", () => {
  it("rozroznia brak edycji, tytul/lead i tresc", () => {
    expect(classifyEdit(article({}))).toBe("none");
    expect(classifyEdit(article({ titleEdited: true }))).toBe("headline");
    expect(classifyEdit(article({ leadEdited: true }))).toBe("headline");
    expect(classifyEdit(article({ titleEdited: true, contentEdited: true }))).toBe("content");
  });
});

describe("share i daysSince", () => {
  it("nie dzieli przez zero", () => {
    expect(share(0, 0)).toBeNull();
    expect(share(1, 4)).toBe(0.25);
  });

  it("liczy pelne dni i nie schodzi ponizej zera", () => {
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince(ago(60), NOW)).toBe(60);
    expect(daysSince(new Date(NOW.getTime() - 1000).toISOString(), NOW)).toBe(0);
    expect(daysSince(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBe(0);
  });
});

describe("summarize", () => {
  it("liczy publikacje, odrzucenia i edycje tylko z okna", () => {
    const summary = summarize(
      [
        article({}),
        article({ titleEdited: true }),
        article({ contentEdited: true }),
        article({ publishedAt: ago(40) }),
        article({ status: "rejected", publishedAt: null, rejectedAt: ago(2) }),
        article({ status: "rejected", publishedAt: null, rejectedAt: ago(40) }),
        article({ status: "review", publishedAt: null }),
        article({ status: "approved", publishedAt: null }),
      ],
      [],
      NOW,
      30,
    );
    expect(summary.published).toBe(3);
    expect(summary.rejected).toBe(1);
    expect(summary.awaitingDecision).toBe(2);
    expect(summary.edits).toEqual({ none: 1, headline: 1, content: 1 });
    expect(summary.noEditShare).toBeCloseTo(1 / 3);
    expect(summary.noContentChangeShare).toBeCloseTo(2 / 3);
  });

  it("zarchiwizowany artykul opublikowany w oknie sie liczy", () => {
    const summary = summarize([article({ status: "archived" })], [], NOW, 7);
    expect(summary.published).toBe(1);
  });

  it("bez publikacji udzialy i koszt jednostkowy sa puste", () => {
    const summary = summarize([], [totals({ llmCalls: 2, llmCostUsd: 0.5 })], NOW, 30);
    expect(summary.noEditShare).toBeNull();
    expect(summary.noContentChangeShare).toBeNull();
    expect(summary.cost.costPerPublishedUsd).toBeNull();
    expect(summary.cost.costUsd).toBe(0.5);
  });

  it("srednie pomijaja null, rozrzut wymaga dwoch ocen", () => {
    const summary = summarize(
      [
        article({ checkedAt: ago(1), quality: 0.8, factualAccuracy: 1, unsupportedClaims: 0 }),
        article({ checkedAt: ago(2), quality: 0.6, factualAccuracy: null, unsupportedClaims: 2 }),
        article({ checkedAt: ago(45), quality: 0.1 }),
      ],
      [],
      NOW,
      30,
    );
    expect(summary.scores.count).toBe(2);
    expect(summary.scores.quality).toBeCloseTo(0.7);
    expect(summary.scores.factualAccuracy).toBe(1);
    expect(summary.scores.clickbait).toBeNull();
    expect(summary.scores.qualityStddev).toBeCloseTo(0.1);
    expect(summary.scores.withUnsupportedClaims).toBe(1);

    const single = summarize([article({ checkedAt: ago(1), quality: 0.8 })], [], NOW, 30);
    expect(single.scores.qualityStddev).toBeNull();
  });

  it("koszt sumuje ceny, a przy samych wywolaniach bez ceny zostaje pusty", () => {
    const summary = summarize(
      [article({}), article({})],
      [
        totals({ llmCalls: 3, llmCostUsd: 0.3, llmUnpricedCalls: 1, llmEscalatedCalls: 1 }),
        totals({ categoryId: null, llmCalls: 1, llmCostUsd: 0.1, llmFailedCalls: 1 }),
      ],
      NOW,
      30,
    );
    expect(summary.cost.calls).toBe(4);
    expect(summary.cost.costUsd).toBeCloseTo(0.4);
    expect(summary.cost.costPerPublishedUsd).toBeCloseTo(0.2);
    expect(summary.cost.unpricedCalls).toBe(1);
    expect(summary.cost.failedCalls).toBe(1);
    expect(summary.cost.escalatedCalls).toBe(1);

    const unpriced = summarize(
      [article({})],
      [totals({ llmCalls: 2, llmUnpricedCalls: 2 })],
      NOW,
      30,
    );
    expect(unpriced.cost.costUsd).toBeNull();
    expect(unpriced.cost.costPerPublishedUsd).toBeNull();
  });
});

describe("buildCriteriaProgress", () => {
  function published(count: number, edited: number): QualityArticle[] {
    return Array.from({ length: count }, (_, index) =>
      article({ publishedAt: ago(10), contentEdited: index < edited }),
    );
  }

  it("dokladnie 95% nie spelnia progu 'ponad 95 procent'", () => {
    const progress = buildCriteriaProgress(published(20, 1), ago(90), NOW);
    expect(progress.cleanShare.value).toBe(0.95);
    expect(progress.cleanShare.state).toBe("not_shown");
  });

  it("powyzej 95% jest spelnione", () => {
    const progress = buildCriteriaProgress(published(21, 1), ago(90), NOW);
    expect(progress.cleanShare.state).toBe("met");
    expect(progress.cleanShare.required).toBe(AUTO_PUBLISH_CRITERIA.minCleanShare);
  });

  it("udzial liczony zawsze na 60 dniach, bez publikacji brak danych", () => {
    const progress = buildCriteriaProgress(
      [article({ publishedAt: ago(59) }), article({ publishedAt: ago(61), contentEdited: true })],
      ago(90),
      NOW,
    );
    expect(progress.cleanShare.published).toBe(1);
    expect(progress.cleanShare.state).toBe("met");
    expect(buildCriteriaProgress([], null, NOW).cleanShare.state).toBe("no_data");
  });

  it("60 dni z redaktorem liczone od pierwszej publikacji", () => {
    expect(buildCriteriaProgress([], ago(59), NOW).daysWithEditor).toMatchObject({
      value: 59,
      met: false,
    });
    expect(buildCriteriaProgress([], ago(60), NOW).daysWithEditor.met).toBe(true);
    expect(buildCriteriaProgress([], null, NOW).daysWithEditor).toMatchObject({
      value: null,
      met: false,
    });
  });

  it("sygnaly halucynacji tylko z ostatnich 30 dni", () => {
    const progress = buildCriteriaProgress(
      [
        article({ status: "rejected", publishedAt: null, rejectedAt: ago(29) }),
        article({ status: "rejected", publishedAt: null, rejectedAt: ago(31) }),
        article({ status: "review", publishedAt: null, unsupportedClaims: 1, checkedAt: ago(3) }),
        article({ status: "review", publishedAt: null, unsupportedClaims: 1, checkedAt: ago(40) }),
        article({ unsupportedClaims: 0, checkedAt: ago(3) }),
      ],
      ago(90),
      NOW,
    );
    expect(progress.hallucinationSignals).toEqual({
      windowDays: 30,
      rejections: 1,
      unsupportedClaimBlocks: 1,
    });
  });
});

describe("buildQualityReport", () => {
  it("grupuje po kategoriach, pomija puste i dodaje 'Bez kategorii' tylko z danymi", () => {
    const report = buildQualityReport(
      [article({ categoryId: CAT_A }), article({ categoryId: "usunieta-kategoria" })],
      [
        totals({ categoryId: CAT_A, firstPublishedAt: ago(70), llmCalls: 2, llmCostUsd: 0.2 }),
        totals({ categoryId: null, llmCalls: 1, llmCostUsd: 0.1 }),
      ],
      CATEGORIES,
      NOW,
      30,
    );
    expect(report.categories.map((category) => category.name)).toEqual([
      "Transfery",
      UNCATEGORIZED_LABEL,
    ]);
    const [transfers, uncategorized] = report.categories;
    expect(transfers?.summary.daysWithEditor).toBe(70);
    expect(transfers?.criteria.daysWithEditor.met).toBe(true);
    expect(uncategorized?.summary.published).toBe(1);
    expect(uncategorized?.summary.cost.costUsd).toBe(0.1);
    expect(report.overall.published).toBe(2);
    expect(report.overall.cost.costUsd).toBeCloseTo(0.3);
    expect(report.overall.firstPublishedAt).toBe(ago(70));
  });

  it("bez danych nie ma kategorii", () => {
    const report = buildQualityReport([], [], CATEGORIES, NOW, 7);
    expect(report.categories).toEqual([]);
    expect(report.overall.noEditShare).toBeNull();
  });
});

describe("listRejections", () => {
  it("najnowsze odrzucenia z okna z nazwa kategorii", () => {
    const items = listRejections(
      [
        article({ status: "rejected", publishedAt: null, rejectedAt: ago(5), rejectReason: "A" }),
        article({ status: "rejected", publishedAt: null, rejectedAt: ago(1), categoryId: null }),
        article({ status: "rejected", publishedAt: null, rejectedAt: ago(10), categoryId: CAT_B }),
        article({ status: "rejected", publishedAt: null, rejectedAt: ago(40) }),
        article({}),
      ],
      CATEGORIES,
      NOW,
      30,
      2,
    );
    expect(items.map((item) => [item.categoryName, item.reason])).toEqual([
      [UNCATEGORIZED_LABEL, null],
      ["Transfery", "A"],
    ]);
  });
});

describe("formatowanie", () => {
  it("udzial z jednym miejscem po przecinku", () => {
    expect(formatShare(null)).toBe("—");
    expect(formatShare(0.9567)).toBe("95,7%");
  });

  it("kwota w USD", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(0.0123)).toContain("0,0123");
  });
});
