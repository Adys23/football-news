import { z } from "zod";

export const articleMetaEditSchema = z.object({
  articleId: z.uuid(),
  // Wartosc z bazy co do mikrosekundy - Date by ja obcial i zapis zawsze konczylby sie konfliktem.
  expectedUpdatedAt: z.string().min(1),
  title: z.string().trim().min(1, "Podaj tytuł."),
  lead: z.string().trim().min(1, "Podaj lead."),
});

export type ArticleMetaEdit = z.infer<typeof articleMetaEditSchema>;

export type ArticleEditState = {
  status: "saved" | "error";
  message: string;
  fieldErrors?: { title?: string[]; lead?: string[] };
  /** Wyniki kontroli deterministycznej, te same co w CHECK_ARTICLE. */
  issues?: string[];
};

export function parseArticleMetaEdit(
  formData: FormData,
): { ok: true; data: ArticleMetaEdit } | { ok: false; state: ArticleEditState } {
  const field = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const parsed = articleMetaEditSchema.safeParse({
    articleId: field("articleId"),
    expectedUpdatedAt: field("expectedUpdatedAt"),
    title: field("title"),
    lead: field("lead"),
  });

  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  const { fieldErrors } = z.flattenError(parsed.error);
  if (fieldErrors.articleId || fieldErrors.expectedUpdatedAt) {
    return { ok: false, state: { status: "error", message: "Formularz jest niekompletny." } };
  }
  return {
    ok: false,
    state: {
      status: "error",
      message: "Popraw zaznaczone pola.",
      fieldErrors: { title: fieldErrors.title, lead: fieldErrors.lead },
    },
  };
}

export const ARTICLE_NOT_FOUND = "Artykuł nie istnieje.";

/** Kody bledow save_article_edit (migracja 0020) na komunikaty dla redaktora. */
const SAVE_ERROR_MESSAGES = new Map([
  [
    "40001",
    "Artykuł zmienił się po otwarciu formularza. Odśwież stronę i nanieś poprawki na aktualną wersję.",
  ],
  ["55000", "Artykuł nie jest już w recenzji, więc nie można go edytować."],
  ["P0002", ARTICLE_NOT_FOUND],
  ["42501", "Brak uprawnień do edycji artykułu."],
]);

export function saveErrorMessage(code: string | undefined): string | null {
  return (code && SAVE_ERROR_MESSAGES.get(code)) || null;
}

/** Ocena AI sprzed ostatniej edycji redaktora nie opisuje obecnego tekstu. */
export function scoresAreStale(checkedAt: string, lastEditedAt: string | null): boolean {
  return lastEditedAt !== null && Date.parse(lastEditedAt) > Date.parse(checkedAt);
}
