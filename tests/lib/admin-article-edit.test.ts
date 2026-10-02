import { describe, expect, it } from "vitest";
import {
  ARTICLE_NOT_FOUND,
  addedImageIds,
  editRuleIssues,
  MAX_QUOTE_WORDS,
  parseArticleContentEdit,
  parseArticleMetaEdit,
  parseHeroImageEdit,
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
    expect(saveErrorMessage("23514")).toMatch(/z biblioteki, mieć licencję i nie być AI/);
  });

  it("nie ukrywa nieznanych bledow bazy", () => {
    expect(saveErrorMessage("23505")).toBeNull();
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

const IMAGE_ID = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const CONTENT = {
  version: 1,
  blocks: [
    { type: "paragraph", text: "Pomocnik przedluzyl umowe." },
    { type: "image", imageId: IMAGE_ID, caption: "Bruno Fernandes" },
  ],
};

describe("parseArticleContentEdit", () => {
  const target = { articleId: ARTICLE_ID, expectedUpdatedAt: UPDATED_AT };

  it("przyjmuje tresc zgodna z articleContentSchema", () => {
    const result = parseArticleContentEdit(form({ ...target, content: JSON.stringify(CONTENT) }));
    expect(result).toEqual({ ok: true, data: { ...target, content: CONTENT } });
  });

  it("wskazuje blok, ktory nie przechodzi schematu", () => {
    const broken = {
      version: 1,
      blocks: [CONTENT.blocks[0], { type: "list", style: "bullet", items: ["jeden"] }],
    };
    const result = parseArticleContentEdit(form({ ...target, content: JSON.stringify(broken) }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.state.issues?.[0]).toMatch(/^Blok 2 \(items\):/);
  });

  it("odrzuca tresc, ktora nie jest JSON-em", () => {
    const result = parseArticleContentEdit(form({ ...target, content: "{" }));
    expect(!result.ok && result.state.message).toBe("Treść nie przechodzi walidacji schematu.");
  });

  it("odrzuca formularz bez id artykulu", () => {
    const result = parseArticleContentEdit(form({ content: JSON.stringify(CONTENT) }));
    expect(!result.ok && result.state.message).toBe("Formularz jest niekompletny.");
  });
});

describe("editRuleIssues", () => {
  const image = { type: "image", imageId: IMAGE_ID, caption: "Bruno Fernandes" } as const;
  const text = { type: "paragraph", text: "Tekst." } as const;
  const quote = { type: "quote", text: "Zostaje w klubie.", attribution: "Trener" } as const;

  const other = { ...image, imageId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2" };
  const LIBRARY_ERROR = "Zdjęcie musi pochodzić z biblioteki obrazów z licencją.";

  it("pozwala zachowac, przesunac albo usunac zdjecie spoza biblioteki", () => {
    expect(editRuleIssues([text, image], [image, text], new Set())).toEqual([]);
    expect(editRuleIssues([text, image], [text], new Set())).toEqual([]);
  });

  it("blokuje nowe zdjecie, zmiane podpisu i powielenie spoza biblioteki", () => {
    for (const after of [[other], [{ ...image, caption: "Inny podpis" }], [image, image]]) {
      expect(editRuleIssues([image], after, new Set())).toEqual([LIBRARY_ERROR]);
    }
  });

  it("przepuszcza nowe zdjecie i podpis dla obrazu z biblioteki", () => {
    const library = new Set([IMAGE_ID, other.imageId]);
    for (const after of [[image, other], [{ ...image, caption: "Inny podpis" }], [image, image]]) {
      expect(editRuleIssues([image], after, library)).toEqual([]);
    }
    expect(editRuleIssues([image], [image, other], new Set([IMAGE_ID]))).toEqual([LIBRARY_ERROR]);
  });

  it("zwraca do sprawdzenia tylko obrazy z nowych lub zmienionych blokow", () => {
    expect(addedImageIds([image], [image, other, other])).toEqual([other.imageId]);
    expect(addedImageIds([image], [text])).toEqual([]);
  });

  it("wymaga autora i limitu slow tylko od nowego albo zmienionego cytatu", () => {
    const orphan = { type: "quote", text: "Cytat bez autora." } as const;
    const long = { ...quote, text: "slowo ".repeat(MAX_QUOTE_WORDS + 1) };
    const none = new Set<string>();
    expect(editRuleIssues([orphan], [orphan, quote], none)).toEqual([]);
    expect(editRuleIssues([], [orphan], none)).toHaveLength(1);
    expect(editRuleIssues([quote], [long], none)).toHaveLength(1);
    expect(editRuleIssues([], [{ ...quote, attribution: " " }], none)).toHaveLength(1);
  });

  it("nie traktuje przycietego, nietknietego cytatu jako zmiany", () => {
    const padded = { type: "quote", text: "Cytat bez autora. " } as const;
    expect(editRuleIssues([padded], [{ ...padded, text: "Cytat bez autora." }], new Set())).toEqual(
      [],
    );
  });
});

describe("parseHeroImageEdit", () => {
  it("przyjmuje obraz albo pusty wybor jako brak obrazu", () => {
    const base = { articleId: ARTICLE_ID, expectedUpdatedAt: UPDATED_AT };
    expect(parseHeroImageEdit(form({ ...base, heroImageId: IMAGE_ID }))).toEqual({
      ok: true,
      data: { ...base, heroImageId: IMAGE_ID },
    });
    expect(parseHeroImageEdit(form({ ...base, heroImageId: "" }))).toEqual({
      ok: true,
      data: { ...base, heroImageId: null },
    });
  });

  it("odrzuca niepoprawny identyfikator i brak artykulu", () => {
    const invalid = parseHeroImageEdit(
      form({ articleId: ARTICLE_ID, expectedUpdatedAt: UPDATED_AT, heroImageId: "x" }),
    );
    expect(invalid.ok).toBe(false);
    expect(parseHeroImageEdit(form({ heroImageId: IMAGE_ID })).ok).toBe(false);
  });
});
