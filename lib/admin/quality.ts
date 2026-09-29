import { z } from "zod";
import type { Enums } from "@contracts/index.ts";
import { DECISION_STATUSES } from "@/lib/admin/publish";

/** Okna raportu w dniach, przelaczane parametrem ?okno=. */
export const QUALITY_WINDOWS = [7, 30, 60] as const;
export type QualityWindow = (typeof QUALITY_WINDOWS)[number];
export const DEFAULT_QUALITY_WINDOW: QualityWindow = 30;

/**
 * Warunki minimalne z docs/roadmap.md ("Kryteria wlaczenia automatycznej publikacji").
 * Raport je tylko wyswietla: niczego nie przelacza, a zmiana wartosci to decyzja
 * wlasciciela (AGENTS.md sekcja 11), nie implementacyjna.
 */
export const AUTO_PUBLISH_CRITERIA = {
  minDaysWithEditor: 60,
  /** "Ponad 95 procent" - ostro wiecej. */
  minCleanShare: 0.95,
  cleanShareWindowDays: 60,
  hallucinationWindowDays: 30,
} as const;

/** Najszersze okno, jakiego potrzebuje raport: wybor uzytkownika albo kryterium 95%. */
export const QUALITY_FETCH_DAYS = Math.max(
  ...QUALITY_WINDOWS,
  AUTO_PUBLISH_CRITERIA.cleanShareWindowDays,
  AUTO_PUBLISH_CRITERIA.hallucinationWindowDays,
);

export const REJECTION_LIST_LIMIT = 20;
export const UNCATEGORIZED_LABEL = "Bez kategorii";

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseQualityWindow(param: string | string[] | undefined): QualityWindow {
  const raw = Array.isArray(param) ? param[0] : param;
  const parsed = z.coerce
    .number()
    .int()
    .refine((value) => (QUALITY_WINDOWS as readonly number[]).includes(value))
    .safeParse(raw);
  return parsed.success ? (parsed.data as QualityWindow) : DEFAULT_QUALITY_WINDOW;
}

export function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** Pelne dni kalendarzowe od chwili iso do now; null bez daty. */
export function daysSince(iso: string | null, now: Date): number | null {
  if (iso === null) {
    return null;
  }
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS));
}

/** Udzial bez NaN: przy zerowym mianowniku null ("brak danych"), nie 0%. */
export function share(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

const ARTICLE_STATUSES = [
  "draft",
  "review",
  "approved",
  "published",
  "rejected",
  "archived",
] as const satisfies readonly Enums<"article_status">[];

// Wygenerowany typ RPC pokazuje pola nullable jako niepuste, dlatego wiersze waliduje zod.
const score = z.number().nullable();

export const qualityArticleRowSchema = z.object({
  article_id: z.string(),
  title: z.string(),
  category_id: z.string().nullable(),
  status: z.enum(ARTICLE_STATUSES),
  published_at: z.string().nullable(),
  rejected_at: z.string().nullable(),
  reject_reason: z.string().nullable(),
  editor_revisions: z.number().int(),
  title_edited: z.boolean(),
  lead_edited: z.boolean(),
  content_edited: z.boolean(),
  factual_accuracy: score,
  originality: score,
  seo: score,
  clickbait: score,
  quality: score,
  unsupported_claims: z.number().int().nullable(),
  checked_at: z.string().nullable(),
});

export const qualityTotalsRowSchema = z.object({
  category_id: z.string().nullable(),
  first_published_at: z.string().nullable(),
  llm_calls: z.number(),
  llm_cost_usd: z.number().nullable(),
  llm_unpriced_calls: z.number(),
  llm_failed_calls: z.number(),
  llm_escalated_calls: z.number(),
});

export interface QualityArticle {
  id: string;
  title: string;
  categoryId: string | null;
  status: Enums<"article_status">;
  publishedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  editorRevisions: number;
  titleEdited: boolean;
  leadEdited: boolean;
  contentEdited: boolean;
  factualAccuracy: number | null;
  originality: number | null;
  seo: number | null;
  clickbait: number | null;
  quality: number | null;
  unsupportedClaims: number | null;
  checkedAt: string | null;
}

export interface QualityTotals {
  categoryId: string | null;
  firstPublishedAt: string | null;
  llmCalls: number;
  llmCostUsd: number | null;
  llmUnpricedCalls: number;
  llmFailedCalls: number;
  llmEscalatedCalls: number;
}

export interface QualityCategory {
  id: string;
  name: string;
}

export function toQualityArticles(rows: unknown[]): QualityArticle[] {
  return rows.map((raw) => {
    const row = qualityArticleRowSchema.parse(raw);
    return {
      id: row.article_id,
      title: row.title,
      categoryId: row.category_id,
      status: row.status,
      publishedAt: row.published_at,
      rejectedAt: row.rejected_at,
      rejectReason: row.reject_reason,
      editorRevisions: row.editor_revisions,
      titleEdited: row.title_edited,
      leadEdited: row.lead_edited,
      contentEdited: row.content_edited,
      factualAccuracy: row.factual_accuracy,
      originality: row.originality,
      seo: row.seo,
      clickbait: row.clickbait,
      quality: row.quality,
      unsupportedClaims: row.unsupported_claims,
      checkedAt: row.checked_at,
    };
  });
}

export function toQualityTotals(rows: unknown[]): QualityTotals[] {
  return rows.map((raw) => {
    const row = qualityTotalsRowSchema.parse(raw);
    return {
      categoryId: row.category_id,
      firstPublishedAt: row.first_published_at,
      llmCalls: row.llm_calls,
      llmCostUsd: row.llm_cost_usd,
      llmUnpricedCalls: row.llm_unpriced_calls,
      llmFailedCalls: row.llm_failed_calls,
      llmEscalatedCalls: row.llm_escalated_calls,
    };
  });
}

/**
 * Klasa edycji opublikowanego artykulu wg rewizji redaktora:
 * none - bez edycji, headline - tylko tytul i/lub lead, content - zmiana blokow tresci.
 * Dane nie odrozniaja poprawki merytorycznej od stylistycznej.
 */
export type EditClass = "none" | "headline" | "content";

export function classifyEdit(
  article: Pick<QualityArticle, "titleEdited" | "leadEdited" | "contentEdited">,
): EditClass {
  if (article.contentEdited) {
    return "content";
  }
  return article.titleEdited || article.leadEdited ? "headline" : "none";
}

function inWindow(iso: string | null, since: Date): boolean {
  return iso !== null && new Date(iso).getTime() >= since.getTime();
}

function mean(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

/** Odchylenie standardowe populacji; ponizej dwoch wartosci nie ma czego mierzyc. */
function stddev(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length < 2) {
    return null;
  }
  const avg = present.reduce((sum, value) => sum + value, 0) / present.length;
  const variance = present.reduce((sum, value) => sum + (value - avg) ** 2, 0) / present.length;
  return Math.sqrt(variance);
}

export interface EditBreakdown {
  none: number;
  headline: number;
  content: number;
}

export interface QualitySummary {
  awaitingDecision: number;
  published: number;
  rejected: number;
  edits: EditBreakdown;
  /** Dolna granica "bez poprawek merytorycznych": opublikowane bez zadnej edycji redaktora. */
  noEditShare: number | null;
  /** Informacyjnie: bez edycji albo tylko tytul/lead. */
  noContentChangeShare: number | null;
  scores: {
    count: number;
    factualAccuracy: number | null;
    quality: number | null;
    qualityStddev: number | null;
    clickbait: number | null;
    originality: number | null;
    seo: number | null;
    withUnsupportedClaims: number;
  };
  cost: {
    calls: number;
    costUsd: number | null;
    unpricedCalls: number;
    failedCalls: number;
    escalatedCalls: number;
    /** Koszt okna / opublikowane w oknie; obejmuje historie zablokowane i odrzucone. */
    costPerPublishedUsd: number | null;
  };
  firstPublishedAt: string | null;
  daysWithEditor: number | null;
}

function sumCost(totals: QualityTotals[]): number | null {
  const priced = totals.filter((total) => total.llmCostUsd !== null);
  return priced.length === 0
    ? null
    : priced.reduce((sum, total) => sum + (total.llmCostUsd ?? 0), 0);
}

function earliest(values: (string | null)[]): string | null {
  const present = values.filter((value): value is string => value !== null);
  if (present.length === 0) {
    return null;
  }
  return present.reduce((min, value) => (new Date(value) < new Date(min) ? value : min));
}

export function summarize(
  articles: QualityArticle[],
  totals: QualityTotals[],
  now: Date,
  windowDays: number,
): QualitySummary {
  const since = daysAgo(now, windowDays);
  const published = articles.filter((article) => inWindow(article.publishedAt, since));
  const edits: EditBreakdown = { none: 0, headline: 0, content: 0 };
  for (const article of published) {
    edits[classifyEdit(article)] += 1;
  }
  const scored = articles.filter((article) => inWindow(article.checkedAt, since));
  const costUsd = sumCost(totals);
  const firstPublishedAt = earliest(totals.map((total) => total.firstPublishedAt));

  return {
    awaitingDecision: articles.filter((article) => DECISION_STATUSES.includes(article.status))
      .length,
    published: published.length,
    rejected: articles.filter(
      (article) => article.status === "rejected" && inWindow(article.rejectedAt, since),
    ).length,
    edits,
    noEditShare: share(edits.none, published.length),
    noContentChangeShare: share(edits.none + edits.headline, published.length),
    scores: {
      count: scored.length,
      factualAccuracy: mean(scored.map((article) => article.factualAccuracy)),
      quality: mean(scored.map((article) => article.quality)),
      qualityStddev: stddev(scored.map((article) => article.quality)),
      clickbait: mean(scored.map((article) => article.clickbait)),
      originality: mean(scored.map((article) => article.originality)),
      seo: mean(scored.map((article) => article.seo)),
      withUnsupportedClaims: scored.filter((article) => (article.unsupportedClaims ?? 0) > 0)
        .length,
    },
    cost: {
      calls: totals.reduce((sum, total) => sum + total.llmCalls, 0),
      costUsd,
      unpricedCalls: totals.reduce((sum, total) => sum + total.llmUnpricedCalls, 0),
      failedCalls: totals.reduce((sum, total) => sum + total.llmFailedCalls, 0),
      escalatedCalls: totals.reduce((sum, total) => sum + total.llmEscalatedCalls, 0),
      costPerPublishedUsd:
        costUsd === null || published.length === 0 ? null : costUsd / published.length,
    },
    firstPublishedAt,
    daysWithEditor: daysSince(firstPublishedAt, now),
  };
}

export type CleanShareState = "met" | "not_shown" | "no_data";

export interface CriteriaProgress {
  daysWithEditor: { value: number | null; required: number; met: boolean };
  cleanShare: {
    windowDays: number;
    published: number;
    value: number | null;
    required: number;
    state: CleanShareState;
  };
  hallucinationSignals: {
    windowDays: number;
    rejections: number;
    unsupportedClaimBlocks: number;
  };
}

/**
 * Postep wzgledem progow roadmapy, zawsze na stalych oknach (60 i 30 dni), niezaleznie od
 * okna wybranego w raporcie. Udzial bez edycji to dolna granica, wiec wynik ponizej progu
 * jest "nie wykazany", a nie "niespelniony". Halucynacji panel nie mierzy wprost.
 */
export function buildCriteriaProgress(
  articles: QualityArticle[],
  firstPublishedAt: string | null,
  now: Date,
): CriteriaProgress {
  const days = daysSince(firstPublishedAt, now);
  const clean = summarize(articles, [], now, AUTO_PUBLISH_CRITERIA.cleanShareWindowDays);
  const hallucinationSince = daysAgo(now, AUTO_PUBLISH_CRITERIA.hallucinationWindowDays);

  let state: CleanShareState = "no_data";
  if (clean.noEditShare !== null) {
    state = clean.noEditShare > AUTO_PUBLISH_CRITERIA.minCleanShare ? "met" : "not_shown";
  }

  return {
    daysWithEditor: {
      value: days,
      required: AUTO_PUBLISH_CRITERIA.minDaysWithEditor,
      met: days !== null && days >= AUTO_PUBLISH_CRITERIA.minDaysWithEditor,
    },
    cleanShare: {
      windowDays: AUTO_PUBLISH_CRITERIA.cleanShareWindowDays,
      published: clean.published,
      value: clean.noEditShare,
      required: AUTO_PUBLISH_CRITERIA.minCleanShare,
      state,
    },
    hallucinationSignals: {
      windowDays: AUTO_PUBLISH_CRITERIA.hallucinationWindowDays,
      rejections: articles.filter(
        (article) =>
          article.status === "rejected" && inWindow(article.rejectedAt, hallucinationSince),
      ).length,
      unsupportedClaimBlocks: articles.filter(
        (article) =>
          (article.unsupportedClaims ?? 0) > 0 && inWindow(article.checkedAt, hallucinationSince),
      ).length,
    },
  };
}

export interface CategoryReport {
  categoryId: string | null;
  name: string;
  summary: QualitySummary;
  criteria: CriteriaProgress;
}

export interface QualityReport {
  windowDays: QualityWindow;
  overall: QualitySummary;
  categories: CategoryReport[];
}

/**
 * Raport na kategorie. Kategorie bez zadnych danych sa pomijane; "Bez kategorii" pojawia sie
 * tylko wtedy, gdy ma artykuly albo koszt (wywolania bez historii tez tu trafiaja).
 * articles musza obejmowac co najmniej QUALITY_FETCH_DAYS, totals - wybrane okno.
 */
export function buildQualityReport(
  articles: QualityArticle[],
  totals: QualityTotals[],
  categories: QualityCategory[],
  now: Date,
  windowDays: QualityWindow,
): QualityReport {
  const keys: { id: string | null; name: string }[] = [
    ...categories.map((category) => ({ id: category.id, name: category.name })),
    { id: null, name: UNCATEGORIZED_LABEL },
  ];
  const known = new Set(categories.map((category) => category.id));
  // Artykul z kategoria usunieta po odczycie listy kategorii liczy sie jako bez kategorii.
  const keyOf = (id: string | null) => (id !== null && known.has(id) ? id : null);

  const reports: CategoryReport[] = [];
  for (const key of keys) {
    const categoryArticles = articles.filter((article) => keyOf(article.categoryId) === key.id);
    const categoryTotals = totals.filter((total) => keyOf(total.categoryId) === key.id);
    if (categoryArticles.length === 0 && categoryTotals.length === 0) {
      continue;
    }
    const summary = summarize(categoryArticles, categoryTotals, now, windowDays);
    reports.push({
      categoryId: key.id,
      name: key.name,
      summary,
      criteria: buildCriteriaProgress(categoryArticles, summary.firstPublishedAt, now),
    });
  }

  return {
    windowDays,
    overall: summarize(articles, totals, now, windowDays),
    categories: reports,
  };
}

export interface RejectionItem {
  articleId: string;
  title: string;
  categoryName: string;
  rejectedAt: string;
  reason: string | null;
}

export function listRejections(
  articles: QualityArticle[],
  categories: QualityCategory[],
  now: Date,
  windowDays: number,
  limit: number = REJECTION_LIST_LIMIT,
): RejectionItem[] {
  const since = daysAgo(now, windowDays);
  const names = new Map(categories.map((category) => [category.id, category.name]));
  return articles
    .filter(
      (article): article is QualityArticle & { rejectedAt: string } =>
        article.status === "rejected" && inWindow(article.rejectedAt, since),
    )
    .sort((a, b) => new Date(b.rejectedAt).getTime() - new Date(a.rejectedAt).getTime())
    .slice(0, limit)
    .map((article) => ({
      articleId: article.id,
      title: article.title,
      categoryName:
        (article.categoryId !== null ? names.get(article.categoryId) : undefined) ??
        UNCATEGORIZED_LABEL,
      rejectedAt: article.rejectedAt,
      reason: article.rejectReason,
    }));
}

/** 0.9567 -> "95,7%". Jedno miejsce po przecinku, bo prog 95% jest ostry. */
export function formatShare(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return `${(value * 100).toLocaleString("pl-PL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

const usdFormat = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function formatUsd(value: number | null): string {
  return value === null ? "—" : usdFormat.format(value);
}
