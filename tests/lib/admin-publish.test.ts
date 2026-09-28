import { describe, expect, it } from "vitest";
import {
  MAX_REJECT_REASON_LENGTH,
  CONFIRM_STALE_SCORE_FIELD,
  decisionErrorMessage,
  parsePublishInput,
  parseRejectInput,
  publishBlockers,
  SEO_REFRESH_PENDING,
  seoRefreshPending,
  type PublishReadiness,
} from "@/lib/admin/publish";

const ARTICLE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const UPDATED_AT = "2026-09-28T10:00:00.123456+00:00";

function ready(overrides: Partial<PublishReadiness> = {}): PublishReadiness {
  return {
    status: "review",
    lead: "Lead artykułu.",
    content: { version: 1, blocks: [{ type: "paragraph", text: "Akapit." }] },
    categoryId: "33333333-3333-4333-8333-333333333331",
    seoTitle: "Jan Kowalski przechodzi do Legii Warszawa",
    seoDescription:
      "Jan Kowalski podpisał kontrakt z Legią Warszawa do 2029 roku. Klub potwierdził transfer w oficjalnym komunikacie wydanym w poniedziałek rano.",
    lastEditedAt: null,
    unsupportedClaims: 0,
    ...overrides,
  };
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("publishBlockers", () => {
  it("nie blokuje kompletnego artykułu w review i approved", () => {
    expect(publishBlockers(ready())).toEqual([]);
    expect(publishBlockers(ready({ status: "approved" }))).toEqual([]);
  });

  it("blokuje twierdzenia bez podparcia, tak jak enforce_publish_guard", () => {
    expect(publishBlockers(ready({ unsupportedClaims: 2 }))).toEqual([
      "Tekst zawiera twierdzenia bez podparcia w faktach (2).",
    ]);
  });

  it("blokuje artykuł bez oceny automatycznej", () => {
    expect(publishBlockers(ready({ unsupportedClaims: null }))).toEqual([
      "Artykuł nie ma oceny automatycznej.",
    ]);
  });

  it("blokuje statusy spoza recenzji", () => {
    for (const status of ["draft", "published", "rejected", "archived"] as const) {
      expect(publishBlockers(ready({ status }))).toEqual([
        "Publikować można tylko artykuł w recenzji.",
      ]);
    }
  });

  it("wymaga leadu, kategorii i niepustej treści zgodnej ze schematem", () => {
    expect(publishBlockers(ready({ lead: "  " }))).toEqual(["Brak leadu."]);
    expect(publishBlockers(ready({ categoryId: null }))).toEqual(["Brak kategorii."]);
    expect(publishBlockers(ready({ content: { version: 1, blocks: [] } }))).toEqual([
      "Treść jest pusta.",
    ]);
    expect(
      publishBlockers(ready({ content: { version: 1, blocks: [{ type: "video" }] } })),
    ).toEqual(["Treść nie przechodzi walidacji schematu."]);
  });

  it("wymaga pól SEO w limitach kontraktu", () => {
    expect(publishBlockers(ready({ seoTitle: null, seoDescription: "za krótki" }))).toEqual([
      "Tytuł SEO jest pusty albo poza limitem długości.",
      "Opis SEO jest pusty albo poza limitem długości.",
    ]);
  });

  it("po edycji tytułu lub leadu pokazuje odświeżanie SEO zamiast pustych pól", () => {
    const edited = ready({
      seoTitle: null,
      seoDescription: null,
      lastEditedAt: "2026-09-28T10:05:00+00:00",
    });
    expect(seoRefreshPending(edited)).toBe(true);
    expect(publishBlockers(edited)).toEqual([SEO_REFRESH_PENDING]);
  });

  it("puste SEO bez edycji redaktora to zwykła blokada pól", () => {
    const article = ready({ seoTitle: null, seoDescription: null });
    expect(seoRefreshPending(article)).toBe(false);
    expect(publishBlockers(article)).toEqual([
      "Tytuł SEO jest pusty albo poza limitem długości.",
      "Opis SEO jest pusty albo poza limitem długości.",
    ]);
    expect(seoRefreshPending(ready({ lastEditedAt: "2026-09-28T10:05:00+00:00" }))).toBe(false);
  });

  it("zbiera wszystkie blokady naraz", () => {
    expect(
      publishBlockers(ready({ lead: null, categoryId: null, unsupportedClaims: 1 })),
    ).toHaveLength(3);
  });
});

describe("parsePublishInput", () => {
  it("zostawia updated_at w postaci z bazy", () => {
    const parsed = parsePublishInput(
      form({ articleId: ARTICLE_ID, expectedUpdatedAt: UPDATED_AT }),
    );
    expect(parsed.success && parsed.data).toEqual({
      articleId: ARTICLE_ID,
      expectedUpdatedAt: UPDATED_AT,
      confirmStaleScore: false,
    });
  });

  it("czyta potwierdzenie publikacji przy ocenie sprzed edycji", () => {
    const parsed = parsePublishInput(
      form({
        articleId: ARTICLE_ID,
        expectedUpdatedAt: UPDATED_AT,
        [CONFIRM_STALE_SCORE_FIELD]: "on",
      }),
    );
    expect(parsed.success && parsed.data.confirmStaleScore).toBe(true);
  });

  it("odrzuca formularz bez id albo wersji", () => {
    expect(
      parsePublishInput(form({ articleId: "nie-uuid", expectedUpdatedAt: UPDATED_AT })).success,
    ).toBe(false);
    expect(parsePublishInput(form({ articleId: ARTICLE_ID })).success).toBe(false);
  });
});

describe("parseRejectInput", () => {
  const target = { articleId: ARTICLE_ID, expectedUpdatedAt: UPDATED_AT };

  it("przycina powód, a pusty zamienia na null", () => {
    const withReason = parseRejectInput(form({ ...target, reason: "  Duplikat.  " }));
    expect(withReason.success && withReason.data.reason).toBe("Duplikat.");

    const blank = parseRejectInput(form({ ...target, reason: "   " }));
    expect(blank.success && blank.data.reason).toBeNull();

    const missing = parseRejectInput(form(target));
    expect(missing.success && missing.data.reason).toBeNull();
  });

  it("odrzuca powód ponad limit bazy", () => {
    const parsed = parseRejectInput(
      form({ ...target, reason: "x".repeat(MAX_REJECT_REASON_LENGTH + 1) }),
    );
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["reason"]);
  });
});

describe("decisionErrorMessage", () => {
  it("tłumaczy kody z migracji 0021 i guarda publikacji", () => {
    for (const code of ["40001", "55000", "P0002", "42501", "23502", "22023", "23514", "22001"]) {
      expect(decisionErrorMessage(code)).toEqual(expect.any(String));
    }
  });

  it("nieznany kod zostaje błędem do zalogowania", () => {
    expect(decisionErrorMessage("XX000")).toBeNull();
    expect(decisionErrorMessage(undefined)).toBeNull();
  });
});
