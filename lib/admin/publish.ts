import { z } from "zod";
import type { Enums, Json } from "@contracts/index.ts";
import { checkSeoField, parseContent } from "@/lib/admin/review";

/** Statusy, z ktorych redaktor moze opublikowac albo odrzucic artykul (migracja 0021). */
export const DECISION_STATUSES: readonly Enums<"article_status">[] = ["review", "approved"];

/** Ten sam limit, co w reject_article. */
export const MAX_REJECT_REASON_LENGTH = 500;

export interface PublishReadiness {
  status: Enums<"article_status">;
  lead: string | null;
  content: Json;
  categoryId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  /** Ostatnia edycja redaktora z article_revisions, null bez edycji. */
  lastEditedAt: string | null;
  /** null, gdy artykul nie ma oceny automatycznej. */
  unsupportedClaims: number | null;
}

export const SEO_REFRESH_PENDING =
  "Metadane SEO są odświeżane po edycji tytułu lub leadu. Odśwież stronę za chwilę; jeśli komunikat nie znika, administrator powinien sprawdzić joby GENERATE_SEO.";

/**
 * Po zmianie tytulu lub leadu save_article_edit (0025) czysci oba pola SEO i kolejkuje
 * GENERATE_SEO. Puste SEO po edycji to stan przejsciowy, nie brak w tekscie.
 */
export function seoRefreshPending(
  article: Pick<PublishReadiness, "status" | "seoTitle" | "seoDescription" | "lastEditedAt">,
): boolean {
  return (
    DECISION_STATUSES.includes(article.status) &&
    article.lastEditedAt !== null &&
    (article.seoTitle === null || article.seoDescription === null)
  );
}

/**
 * Powody, dla ktorych przycisk Publikuj jest zablokowany. Lead, kategorie, niepusta tresc,
 * status i unsupported_claims sprawdza tez baza; schemat tresci, ocene i SEO tylko panel.
 */
export function publishBlockers(article: PublishReadiness): string[] {
  const blockers: string[] = [];

  if (!DECISION_STATUSES.includes(article.status)) {
    blockers.push("Publikować można tylko artykuł w recenzji.");
  }
  if (article.unsupportedClaims === null) {
    blockers.push("Artykuł nie ma oceny automatycznej.");
  } else if (article.unsupportedClaims > 0) {
    blockers.push(
      `Tekst zawiera twierdzenia bez podparcia w faktach (${article.unsupportedClaims}).`,
    );
  }
  if (!article.lead?.trim()) {
    blockers.push("Brak leadu.");
  }

  const content = parseContent(article.content);
  if (!content.ok) {
    blockers.push("Treść nie przechodzi walidacji schematu.");
  } else if (content.content.blocks.length === 0) {
    blockers.push("Treść jest pusta.");
  }

  if (!article.categoryId) {
    blockers.push("Brak kategorii.");
  }
  if (seoRefreshPending(article)) {
    blockers.push(SEO_REFRESH_PENDING);
  } else {
    if (!checkSeoField("seo_title", article.seoTitle).ok) {
      blockers.push("Tytuł SEO jest pusty albo poza limitem długości.");
    }
    if (!checkSeoField("seo_description", article.seoDescription).ok) {
      blockers.push("Opis SEO jest pusty albo poza limitem długości.");
    }
  }

  return blockers;
}

const decisionTargetSchema = z.object({
  articleId: z.uuid(),
  // Wartosc z bazy co do mikrosekundy, jak w edycji - bez przejscia przez Date.
  expectedUpdatedAt: z.string().min(1),
});

export const rejectInputSchema = decisionTargetSchema.extend({
  reason: z
    .string()
    .trim()
    .max(MAX_REJECT_REASON_LENGTH, `Powód może mieć najwyżej ${MAX_REJECT_REASON_LENGTH} znaków.`)
    .transform((value) => value || null),
});

export type DecisionState = { status: "error"; message: string; issues?: string[] } | undefined;

const field = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export function parsePublishInput(formData: FormData) {
  return decisionTargetSchema.safeParse({
    articleId: field(formData, "articleId"),
    expectedUpdatedAt: field(formData, "expectedUpdatedAt"),
  });
}

export function parseRejectInput(formData: FormData) {
  return rejectInputSchema.safeParse({
    articleId: field(formData, "articleId"),
    expectedUpdatedAt: field(formData, "expectedUpdatedAt"),
    reason: field(formData, "reason"),
  });
}

/** Kody bledow publish_article i reject_article (migracja 0021) na komunikaty dla redaktora. */
const DECISION_ERROR_MESSAGES = new Map([
  ["40001", "Artykuł zmienił się po otwarciu widoku. Odśwież stronę i sprawdź aktualną wersję."],
  ["55000", "Artykuł nie jest już w recenzji. Odśwież stronę."],
  ["P0002", "Artykuł nie istnieje."],
  ["42501", "Brak uprawnień do publikacji i odrzucania artykułów."],
  ["23502", "Artykuł nie ma leadu, kategorii albo treści."],
  ["23514", "Baza zablokowała publikację: tekst zawiera twierdzenia bez podparcia w faktach."],
  ["22001", `Powód może mieć najwyżej ${MAX_REJECT_REASON_LENGTH} znaków.`],
]);

export function decisionErrorMessage(code: string | undefined): string | null {
  return (code && DECISION_ERROR_MESSAGES.get(code)) || null;
}
