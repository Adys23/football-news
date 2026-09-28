import { describe, expect, it } from "vitest";
import {
  ARTICLE_NOT_FOUND,
  parseArticleMetaEdit,
  saveErrorMessage,
  scoresAreStale,
} from "@/lib/admin/article-edit";

const ARTICLE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const UPDATED_AT = "2026-09-28T09:47:43.839054+00:00";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const VALID = {
  articleId: ARTICLE_ID,
  expectedUpdatedAt: UPDATED_AT,
  title: "  Bruno Fernandes przedluzyl kontrakt z Manchesterem United  ",
  lead: " Pomocnik zostaje w klubie do 2027 roku. ",
};

describe("parseArticleMetaEdit", () => {
  it("przycina tytul i lead", () => {
    const result = parseArticleMetaEdit(form(VALID));
    expect(result).toEqual({
      ok: true,
      data: {
        articleId: ARTICLE_ID,
        expectedUpdatedAt: UPDATED_AT,
        title: "Bruno Fernandes przedluzyl kontrakt z Manchesterem United",
        lead: "Pomocnik zostaje w klubie do 2027 roku.",
      },
    });
  });

  it("zachowuje updated_at z mikrosekundami bez zmian", () => {
    const result = parseArticleMetaEdit(form(VALID));
    expect(result.ok && result.data.expectedUpdatedAt).toBe(UPDATED_AT);
  });

  it("zglasza puste pola przy polach formularza", () => {
    const result = parseArticleMetaEdit(form({ ...VALID, title: "   ", lead: "" }));
    expect(result).toEqual({
      ok: false,
      state: {
        status: "error",
        message: "Popraw zaznaczone pola.",
        fieldErrors: { title: ["Podaj tytuł."], lead: ["Podaj lead."] },
      },
    });
  });

  it("odrzuca formularz bez id artykulu albo wersji", () => {
    for (const broken of [
      { ...VALID, articleId: "nie-uuid" },
      { ...VALID, expectedUpdatedAt: "" },
    ]) {
      expect(parseArticleMetaEdit(form(broken))).toEqual({
        ok: false,
        state: { status: "error", message: "Formularz jest niekompletny." },
      });
    }
  });

  it("traktuje brakujace pola jak puste", () => {
    const result = parseArticleMetaEdit(form({ articleId: ARTICLE_ID }));
    expect(result.ok).toBe(false);
  });
});

describe("saveErrorMessage", () => {
  it("tlumaczy kody save_article_edit", () => {
    expect(saveErrorMessage("40001")).toMatch(/zmienił się po otwarciu formularza/);
    expect(saveErrorMessage("55000")).toMatch(/nie jest już w recenzji/);
    expect(saveErrorMessage("P0002")).toBe(ARTICLE_NOT_FOUND);
    expect(saveErrorMessage("42501")).toMatch(/Brak uprawnień/);
  });

  it("nie ukrywa nieznanych bledow bazy", () => {
    expect(saveErrorMessage("23514")).toBeNull();
    expect(saveErrorMessage(undefined)).toBeNull();
  });
});

describe("scoresAreStale", () => {
  const CHECKED_AT = "2026-09-28T09:00:00Z";

  it("bez edycji redaktora ocena jest aktualna", () => {
    expect(scoresAreStale(CHECKED_AT, null)).toBe(false);
  });

  it("edycja po ocenie oznacza nieaktualna ocene", () => {
    expect(scoresAreStale(CHECKED_AT, "2026-09-28T09:30:00Z")).toBe(true);
  });

  it("edycja przed ponowna ocena nie oznacza nieaktualnej oceny", () => {
    expect(scoresAreStale(CHECKED_AT, "2026-09-28T08:30:00Z")).toBe(false);
  });
});
