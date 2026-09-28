import { z } from "zod";
import { articleContentSchema, type ArticleBlock, type ArticleContent } from "@contracts/index.ts";

const articleEditTargetSchema = z.object({
  articleId: z.uuid(),
  // Wartosc z bazy co do mikrosekundy - Date by ja obcial i zapis zawsze konczylby sie konfliktem.
  expectedUpdatedAt: z.string().min(1),
});

export const articleMetaEditSchema = articleEditTargetSchema.extend({
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

export type ArticleContentEdit = z.infer<typeof articleEditTargetSchema> & {
  content: ArticleContent;
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const polishErrors = z.locales.pl().localeError;

/** Ten sam schemat w edytorze (podpowiedz) i w server action (decyzja), z komunikatami po polsku. */
export function validateArticleContent(value: unknown) {
  return articleContentSchema.safeParse(value, { error: polishErrors });
}

export function parseArticleContentEdit(
  formData: FormData,
): { ok: true; data: ArticleContentEdit } | { ok: false; state: ArticleEditState } {
  const target = articleEditTargetSchema.safeParse({
    articleId: formData.get("articleId"),
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
  });
  if (!target.success) {
    return { ok: false, state: { status: "error", message: "Formularz jest niekompletny." } };
  }

  const raw = formData.get("content");
  const content = validateArticleContent(typeof raw === "string" ? parseJson(raw) : undefined);
  if (!content.success) {
    return {
      ok: false,
      state: {
        status: "error",
        message: "Treść nie przechodzi walidacji schematu.",
        issues: contentSchemaIssues(content.error),
      },
    };
  }
  return { ok: true, data: { ...target.data, content: content.data } };
}

export function contentSchemaIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const [, index, ...rest] = issue.path;
    const where = typeof index === "number" ? `Blok ${index + 1}` : "Treść";
    return `${where}${rest.length > 0 ? ` (${rest.join(".")})` : ""}: ${issue.message}`;
  });
}

type BlockOf<T extends ArticleBlock["type"]> = Extract<ArticleBlock, { type: T }>;

// Edytor przycina pola przed zapisem, wiec nietkniety blok z bialymi znakami nie jest zmiana.
const blockKey = (block: ArticleBlock) =>
  JSON.stringify(block, (_key, value: unknown) =>
    typeof value === "string" ? value.trim() : value,
  );

/** Bloki danego typu, ktorych przed edycja nie bylo w tej postaci: nowe albo zmienione. */
function addedBlocks<T extends ArticleBlock["type"]>(
  before: readonly ArticleBlock[],
  after: readonly ArticleBlock[],
  type: T,
): BlockOf<T>[] {
  const ofType = (blocks: readonly ArticleBlock[]) =>
    blocks.filter((block): block is BlockOf<T> => block.type === type);
  const remaining = ofType(before).map(blockKey);
  return ofType(after).filter((block) => {
    const index = remaining.indexOf(blockKey(block));
    if (index === -1) {
      return true;
    }
    remaining.splice(index, 1);
    return false;
  });
}

/** Cytat to krotki fragment z atrybucja (AGENTS.md, zasada 10); kontrola kopiowania go pomija. */
export const MAX_QUOTE_WORDS = 40;

/**
 * Zasady edycji z panelu, ktorych nie wyraza schemat. Obraz wolno tylko zachowac albo usunac:
 * nowy wymaga wyboru z image_assets z licencja, ktorego panel jeszcze nie ma.
 * Nowy lub zmieniony cytat musi miec autora i miescic sie w limicie slow.
 */
export function editRuleIssues(
  before: readonly ArticleBlock[],
  after: readonly ArticleBlock[],
): string[] {
  const issues: string[] = [];
  if (addedBlocks(before, after, "image").length > 0) {
    issues.push("Zdjęcie można tylko zachować albo usunąć.");
  }
  for (const quote of addedBlocks(before, after, "quote")) {
    const words = quote.text.split(/\s+/).filter(Boolean).length;
    if (!quote.attribution?.trim() || words > MAX_QUOTE_WORDS) {
      issues.push(`Cytat wymaga autora i może mieć najwyżej ${MAX_QUOTE_WORDS} słów.`);
    }
  }
  return issues;
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
