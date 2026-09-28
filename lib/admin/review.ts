import {
  articleContentSchema,
  factConflictSchema,
  qaIssueSchema,
  seoOutputSchema,
  type ArticleContent,
  type FactConflict,
  type Json,
} from "@contracts/index.ts";
import type { z } from "zod";
import {
  buildExtractionInput,
  groupFacts,
  type FactRow,
  type StorySourceRow,
} from "@shared/lib/facts.ts";

export type QaIssue = z.infer<typeof qaIssueSchema>;

export type ParsedContent = { ok: true; content: ArticleContent } | { ok: false; errors: string[] };

/** Tresc spoza schematu nie wywraca widoku - redaktor ma zobaczyc, co jest zle. */
export function parseContent(content: Json): ParsedContent {
  const result = articleContentSchema.safeParse(content);
  if (result.success) {
    return { ok: true, content: result.data };
  }
  return {
    ok: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "content"}: ${issue.message}`,
    ),
  };
}

function parseEach<T>(value: Json | undefined, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const result = schema.safeParse(entry);
    return result.success ? [result.data] : [];
  });
}

export function parseIssues(issues: Json | undefined): QaIssue[] {
  return parseEach(issues, qaIssueSchema);
}

export function parseConflicts(conflicts: Json | undefined): FactConflict[] {
  return parseEach(conflicts, factConflictSchema);
}

/** Uwagi QA przypiete do istniejacego bloku; reszta, w tym indeks spoza tresci, jest ogolna. */
export function issuesByBlock(
  issues: readonly QaIssue[],
  blockCount: number,
): { byBlock: Map<number, QaIssue[]>; general: QaIssue[] } {
  const byBlock = new Map<number, QaIssue[]>();
  const general: QaIssue[] = [];

  for (const issue of issues) {
    if (issue.block !== undefined && issue.block < blockCount) {
      byBlock.set(issue.block, [...(byBlock.get(issue.block) ?? []), issue]);
    } else {
      general.push(issue);
    }
  }

  return { byBlock, general };
}

export interface ReviewSource {
  sourceItemId: string;
  sourceId: string;
  sourceName: string;
  sourceType: StorySourceRow["sourceType"];
  trustScore: number;
  language: string;
  url: string;
  title: string;
  publishedAt: string | null;
  linkedAt: string;
}

/**
 * Numeracja zrodel taka, jaka widzial model w VALIDATE_FACTS: ta sama funkcja
 * sortujaca. Model dostaje w `sources[]` kazdy material z osobnym numerem,
 * wiec konflikt moze wskazac dowolny z nich - dwa numery moga nalezec do jednego zrodla.
 */
export function assessmentSourceNumbers(sources: readonly ReviewSource[]): Map<number, string> {
  const { input } = buildExtractionInput(sources.map((source) => ({ ...source, content: null })));
  return new Map(input.sources.map(({ index, source }) => [index, source]));
}

/** URL z cudzego feedu trafia do href tylko jako http(s); reszta jest pokazywana jako tekst. */
export function safeHttpUrl(url: string): string | null {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Material dolaczony po ocenie przesuwa numeracje - nazwy zrodel w konfliktach bylyby zgadywaniem.
 * Nie wykrywa zmiany trust_score zrodla po ocenie; to wymaga zapisu id zrodel w konfliktach.
 */
export function assessmentIsStale(
  assessedAt: string,
  sources: readonly Pick<ReviewSource, "linkedAt">[],
): boolean {
  const assessed = Date.parse(assessedAt);
  return sources.some((source) => Date.parse(source.linkedAt) > assessed);
}

export type FactVerdict = "approved" | "rejected" | "unassessed";

export interface ReviewFact {
  id: string;
  statement: string;
  confidence: number;
  verdict: FactVerdict;
  sourceNames: string[];
}

/**
 * Fakty tak, jak widziala je walidacja: wiersze z roznych zrodel zlaczone w jeden.
 * Zatwierdzony id moze wskazywac dowolny wiersz grupy (patrz loadApprovedFacts).
 * Brak oceny albo ocena wskazujaca fakty, ktorych juz nie ma (ponowna ekstrakcja),
 * to "bez oceny" - nie wolno tego pokazac jako odrzucenia przez walidacje.
 */
export function reviewFacts(
  rows: readonly FactRow[],
  sources: readonly ReviewSource[],
  approvedFactIds: readonly string[] | null,
): ReviewFact[] {
  const trustBySource = new Map(sources.map((source) => [source.sourceId, source.trustScore]));
  const nameBySource = new Map(sources.map((source) => [source.sourceId, source.sourceName]));
  const approved = new Set(approvedFactIds ?? []);
  const groups = groupFacts([...rows], trustBySource);
  const matched = groups.filter((group) => group.rowIds.some((rowId) => approved.has(rowId)));
  const assessed = approvedFactIds !== null && matched.length === approved.size;

  return groups.map((group) => ({
    id: group.id,
    statement: group.statement_pl,
    confidence: group.confidence,
    verdict: !assessed ? "unassessed" : matched.includes(group) ? "approved" : "rejected",
    sourceNames: group.sources.flatMap(({ sourceId }) => nameBySource.get(sourceId) ?? []),
  }));
}

/** fact_box trzyma id wierszy; kazdy wiersz grupy prowadzi do tego samego zdania. */
export function factStatementsById(rows: readonly FactRow[]): Map<string, string> {
  return new Map(rows.map((row) => [row.id, row.statement_pl]));
}

export interface SeoFieldCheck {
  length: number;
  min: number | null;
  max: number | null;
  ok: boolean;
}

/** Limity z kontraktu GENERATE_SEO, zeby panel nie trzymal wlasnej kopii liczb. */
export function checkSeoField(
  field: "seo_title" | "seo_description",
  value: string | null,
): SeoFieldCheck {
  const schema = seoOutputSchema.shape[field];
  return {
    length: value?.length ?? 0,
    min: schema.minLength,
    max: schema.maxLength,
    ok: value !== null && schema.safeParse(value).success,
  };
}
