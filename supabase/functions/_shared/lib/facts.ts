import type { Database } from "../contracts/database.types.ts";
import type {
  FactExtractionInput,
  FactExtractionOutput,
  FactExtractionSource,
} from "../contracts/facts.ts";
import type { JobType } from "../contracts/jobs.ts";
import { sha256Hex } from "./hash.ts";

/**
 * Czysta logika etapu EXTRACT_FACTS: budowa wejscia modelu ze zrodel historii
 * i zamiana wyjscia modelu na wiersze `facts`. Handler robi tylko I/O.
 */

/** Limit znakow tresci jednego zrodla. Tresci sa skracane, bo placimy za tokeny wejscia. */
export const MAX_SOURCE_CONTENT_CHARS = 4_000;
/** Powyzej tylu zrodel ekstrakcja idzie na model eskalacyjny (docs/ai-pipeline.md, sekcja 8). */
export const ESCALATION_SOURCE_COUNT = 4;

export type StorySourceRow = {
  sourceItemId: string;
  sourceId: string;
  sourceName: string;
  sourceType: FactExtractionSource["source_type"];
  trustScore: number;
  language: string;
  publishedAt: string | null;
  title: string;
  content: string | null;
};

/** Indeks z wejscia modelu -> zrodlo w bazie. */
export type SourceIndexMap = Map<number, { sourceId: string; sourceItemId: string }>;

export type FactInsert = Database["public"]["Tables"]["facts"]["Insert"];

/** Najpierw zrodla najbardziej wiarygodne, potem najwczesniejsze - ta kolejnosc wyznacza indeksy. */
export function buildExtractionInput(rows: StorySourceRow[]): {
  input: FactExtractionInput;
  sourceMap: SourceIndexMap;
} {
  const ordered = [...rows].sort(
    (a, b) =>
      b.trustScore - a.trustScore ||
      (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "") ||
      a.sourceItemId.localeCompare(b.sourceItemId),
  );

  const sourceMap: SourceIndexMap = new Map();
  const sources = ordered.map((row, position) => {
    const index = position + 1;
    sourceMap.set(index, { sourceId: row.sourceId, sourceItemId: row.sourceItemId });

    return {
      index,
      source: row.sourceName,
      source_type: row.sourceType,
      trust_score: row.trustScore,
      // Postgres zwraca offset "+00:00"; kontrakt wejscia oczekuje ISO z "Z".
      published_at: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
      title: row.title,
      content: (row.content ?? "").slice(0, MAX_SOURCE_CONTENT_CHARS),
    };
  });

  return { input: { sources }, sourceMap };
}

export function shouldEscalateExtraction(rows: StorySourceRow[]): boolean {
  const languages = new Set(rows.map((row) => row.language));
  return rows.length > ESCALATION_SOURCE_COUNT || languages.size > 1;
}

/**
 * Jeden wiersz na pare (fakt, zrodlo) - tak dziala unikalny indeks `facts`.
 * Fakty ponizej progu pewnosci i indeksy spoza wejscia sa odrzucane,
 * a fakt bez zadnego poprawnego zrodla nie trafia do bazy.
 */
export function factRowsFromExtraction(
  output: FactExtractionOutput,
  sourceMap: SourceIndexMap,
  storyId: string,
  minConfidence: number,
): FactInsert[] {
  const rows = new Map<string, FactInsert>();

  for (const fact of output.facts) {
    if (fact.confidence < minConfidence) {
      continue;
    }

    for (const index of fact.source_indexes) {
      const source = sourceMap.get(index);
      if (!source) {
        continue;
      }

      const key = [fact.subject, fact.predicate, fact.object ?? "", source.sourceId].join("\u0000");
      if (rows.has(key)) {
        continue;
      }

      rows.set(key, {
        story_id: storyId,
        subject: fact.subject,
        predicate: fact.predicate,
        object: fact.object,
        value: fact.value,
        statement_pl: fact.statement_pl,
        confidence: fact.confidence,
        source_id: source.sourceId,
        source_item_id: source.sourceItemId,
      });
    }
  }

  return [...rows.values()];
}

export type FactRow = {
  id: string;
  subject: string;
  predicate: string;
  object: string | null;
  statement_pl: string;
  confidence: number;
  source_id: string | null;
};

/** Fakt po zlaczeniu wierszy z roznych zrodel. `id` to wiersz z najbardziej wiarygodnego zrodla. */
export type FactGroup = {
  id: string;
  subject: string;
  predicate: string;
  object: string | null;
  statement_pl: string;
  confidence: number;
  sources: { sourceId: string; trustScore: number }[];
  /** Wszystkie wiersze faktu - zatwierdzony id pozostaje rozpoznawalny po zmianie zaufania zrodla. */
  rowIds: string[];
};

/**
 * Walidacja i pisanie widza kazdy fakt raz, nie raz na zrodlo. Kolejnosc:
 * od najpewniejszego - od niej zaleza placeholdery {{fact_N}} w fixtures.
 */
export function groupFacts(rows: FactRow[], trustBySource: Map<string, number>): FactGroup[] {
  const groups = new Map<string, { rows: FactRow[] }>();

  for (const row of rows) {
    const key = [row.subject, row.predicate, row.object ?? ""].join("\u0000");
    const group = groups.get(key) ?? { rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const trust = (row: FactRow) => (row.source_id ? (trustBySource.get(row.source_id) ?? 0) : 0);

  return [...groups.values()]
    .map(({ rows: members }) => {
      const best = members.reduce((a, b) =>
        trust(b) > trust(a) || (trust(b) === trust(a) && b.id < a.id) ? b : a,
      );
      const sources = new Map<string, number>();
      for (const row of members) {
        if (row.source_id) {
          sources.set(row.source_id, trust(row));
        }
      }

      return {
        id: best.id,
        subject: best.subject,
        predicate: best.predicate,
        object: best.object,
        statement_pl: best.statement_pl,
        confidence: Math.max(...members.map((row) => row.confidence)),
        sources: [...sources].map(([sourceId, trustScore]) => ({ sourceId, trustScore })),
        rowIds: members.map((row) => row.id),
      };
    })
    .sort((a, b) => b.confidence - a.confidence || a.statement_pl.localeCompare(b.statement_pl));
}

/** Eskalacja walidacji: niska pewnosc albo ten sam podmiot i orzeczenie z roznym dopelnieniem. */
export function shouldEscalateValidation(
  groups: FactGroup[],
  escalationConfidence: number,
): boolean {
  const best = Math.max(0, ...groups.map((group) => group.confidence));
  const objects = new Map<string, Set<string>>();
  for (const group of groups) {
    const key = `${group.subject}\u0000${group.predicate}`;
    objects.set(key, (objects.get(key) ?? new Set()).add(group.object ?? ""));
  }

  return best < escalationConfidence || [...objects.values()].some((set) => set.size > 1);
}

/**
 * Klucz zestawu materialow historii, niezalezny od kolejnosci. Trafia do dedupe_key
 * joba VALIDATE_FACTS, wiec istnienie takiego joba oznacza, ze ten zestaw
 * zostal juz wyekstrahowany - to jest cache ekstrakcji.
 */
export async function itemSetKey(sourceItemIds: string[]): Promise<string> {
  const sorted = [...new Set(sourceItemIds)].sort();
  return (await sha256Hex(sorted.join(","))).slice(0, 16);
}

/**
 * Klucz jobow od walidacji w dol. Wiaze job z zestawem materialow, z ktorego
 * policzono fakty - job starszego zestawu rozpoznaje, ze jest nieaktualny.
 */
export function itemSetDedupeKey(type: JobType, storyId: string, setKey: string): string {
  return `${type}:${storyId}:${setKey}`;
}
