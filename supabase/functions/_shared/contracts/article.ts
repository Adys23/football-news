import { z } from "zod";
import { MAX_TITLE_LENGTH } from "../lib/title-guard.ts";

/**
 * Kontrakty tresci: bloki artykulu, wyjscia etapow GENERATE_ARTICLE,
 * GENERATE_TITLE, GENERATE_SEO oraz CHECK_ARTICLE.
 *
 * Tresc trzymamy jako bloki JSON, nie HTML - daje to pelna kontrole nad
 * renderowaniem i pozwala walidowac strukture przed zapisem do bazy.
 */

export const articleBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("paragraph"),
    text: z.string().min(1),
  }),
  z.object({
    type: z.literal("heading"),
    level: z.union([z.literal(2), z.literal(3)]),
    text: z.string().min(1),
  }),
  z.object({
    type: z.literal("quote"),
    text: z.string().min(1),
    attribution: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("image"),
    imageId: z.uuid(),
    caption: z.string().optional(),
  }),
  z.object({
    type: z.literal("list"),
    style: z.enum(["bullet", "number"]),
    items: z.array(z.string().min(1)).min(2),
  }),
  z.object({
    type: z.literal("fact_box"),
    title: z.string().min(1).optional(),
    factIds: z.array(z.uuid()).min(1),
  }),
]);

export const articleContentSchema = z.object({
  version: z.literal(1),
  blocks: z.array(articleBlockSchema),
});

/** Wyjscie etapu GENERATE_ARTICLE (prompt 03-write-article.md). */
export const articleDraftOutputSchema = z.object({
  lead: z.string().min(1),
  blocks: z.array(articleBlockSchema).min(3),
  /**
   * Obowiazkowe. Pozwala maszynowo sprawdzic, czy tekst nie wyszedl poza
   * zatwierdzony zbior faktow - bez tego kontrola jakosci jest zgadywaniem.
   */
  used_fact_ids: z.array(z.uuid()).min(1),
  excerpt: z.string().min(1),
});

/** Wyjscie etapu GENERATE_TITLE, wywolanie A (prompt 04-generate-titles.md). */
export const titleCandidatesOutputSchema = z.object({
  titles: z.array(z.string().min(1).max(MAX_TITLE_LENGTH)).length(5),
});

/** Wyjscie etapu GENERATE_TITLE, wywolanie B (prompt 05-select-title.md). */
export const titleSelectionOutputSchema = z.object({
  selected: z.string().min(1).max(MAX_TITLE_LENGTH),
  reason: z.string().min(1),
  rejected_reasons: z.record(z.string(), z.string()).default({}),
});

/** Wyjscie etapu GENERATE_SEO (prompt 07-generate-seo.md). */
export const seoOutputSchema = z.object({
  seo_title: z.string().min(1).max(70),
  seo_description: z.string().min(120).max(165),
  slug: z
    .string()
    .min(3)
    .max(90)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug moze zawierac tylko male litery, cyfry i myslniki"),
});

/** Wyjscie etapu CHECK_ARTICLE (prompt 06-qa-check.md). */
export const qaIssueSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  block: z.number().int().nonnegative().optional(),
  message: z.string().min(1),
});

export const qaScoresOutputSchema = z.object({
  factual_accuracy: z.number().min(0).max(1),
  originality: z.number().min(0).max(1),
  seo: z.number().min(0).max(1),
  clickbait: z.number().min(0).max(1),
  quality: z.number().min(0).max(1),
  unsupported_claims: z.number().int().nonnegative(),
  issues: z.array(qaIssueSchema).default([]),
});

export type ArticleBlock = z.infer<typeof articleBlockSchema>;
export type ArticleContent = z.infer<typeof articleContentSchema>;
export type ArticleDraftOutput = z.infer<typeof articleDraftOutputSchema>;
export type SeoOutput = z.infer<typeof seoOutputSchema>;
export type QaScoresOutput = z.infer<typeof qaScoresOutputSchema>;

export type QaDecision = "review" | "blocked";

export type QaThresholds = {
  qualityThreshold: number;
  clickbaitThreshold: number;
};

/**
 * Decyzja po automatycznej kontroli jakosci.
 *
 * W MVP zaden wynik nie prowadzi do automatycznej publikacji - scoring decyduje
 * tylko o tym, czy artykul zajmie czas redaktora, czy trafi do blocked.
 */
export function decideAfterQa(scores: QaScoresOutput, thresholds: QaThresholds): QaDecision {
  if (scores.unsupported_claims > 0) {
    return "blocked";
  }

  if (scores.clickbait > thresholds.clickbaitThreshold) {
    return "blocked";
  }

  if (scores.quality < 0.7) {
    return "blocked";
  }

  return "review";
}

/** Czy artykul kwalifikuje sie do szybkiej sciezki w panelu redaktora. */
export function isFastTrack(scores: QaScoresOutput, thresholds: QaThresholds): boolean {
  return (
    scores.unsupported_claims === 0 &&
    scores.quality >= thresholds.qualityThreshold &&
    scores.clickbait <= thresholds.clickbaitThreshold
  );
}

/** Granice dlugosci tekstu z promptu 03-write-article.md. */
export const DRAFT_PARAGRAPHS = { min: 4, max: 7 } as const;
export const DRAFT_WORDS = { min: 250, max: 450 } as const;

/** Liczba akapitow i slow w akapitach. Naglowki, cytaty i fact_box nie wliczaja sie do dlugosci. */
export function measureDraft(blocks: ArticleBlock[]): { paragraphs: number; words: number } {
  const paragraphs = blocks.flatMap((block) => (block.type === "paragraph" ? [block.text] : []));
  const words = paragraphs.reduce((sum, text) => sum + text.split(/\s+/).filter(Boolean).length, 0);
  return { paragraphs: paragraphs.length, words };
}

/**
 * Deterministyczne warunki tresci: fact_box tylko z zatwierdzonych faktow,
 * liczba akapitow i slow. Sprawdzane przed zapisem draftu i w kontroli jakosci,
 * ktora widzi zapisane bloki (used_fact_ids nie jest przechowywane w artykule).
 */
export function contentIssues(blocks: ArticleBlock[], approvedFactIds: string[]): string[] {
  const issues: string[] = [];
  const approved = new Set(approvedFactIds);
  const boxed = blocks.flatMap((block) => (block.type === "fact_box" ? block.factIds : []));
  const { paragraphs, words } = measureDraft(blocks);

  if (boxed.some((id) => !approved.has(id))) {
    issues.push("fact_box wskazuje fakt spoza zatwierdzonych.");
  }
  if (paragraphs < DRAFT_PARAGRAPHS.min || paragraphs > DRAFT_PARAGRAPHS.max) {
    issues.push(
      `Akapitow: ${paragraphs}, dozwolone ${DRAFT_PARAGRAPHS.min}-${DRAFT_PARAGRAPHS.max}.`,
    );
  }
  if (words < DRAFT_WORDS.min || words > DRAFT_WORDS.max) {
    issues.push(`Slow: ${words}, dozwolone ${DRAFT_WORDS.min}-${DRAFT_WORDS.max}.`);
  }

  return issues;
}

/** Warunki draftu z modelu: tresc plus used_fact_ids wylacznie z zatwierdzonych. */
export function draftIssues(draft: ArticleDraftOutput, approvedFactIds: string[]): string[] {
  const approved = new Set(approvedFactIds);
  const outside = draft.used_fact_ids.filter((id) => !approved.has(id));
  return [
    ...(outside.length > 0 ? [`Fakty spoza zatwierdzonych: ${outside.join(", ")}.`] : []),
    ...contentIssues(draft.blocks, approvedFactIds),
  ];
}

/** Czy tekst trzyma sie zatwierdzonych faktow. */
export function hasOnlyApprovedFacts(
  draft: ArticleDraftOutput,
  approvedFactIds: string[],
): boolean {
  const approved = new Set(approvedFactIds);
  return draft.used_fact_ids.every((id) => approved.has(id));
}
