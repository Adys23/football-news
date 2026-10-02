import "server-only";

import {
  QUALITY_FETCH_DAYS,
  buildQualityReport,
  daysAgo,
  listRejections,
  toQualityArticles,
  toQualityTotals,
  type QualityArticle,
  type QualityCategory,
  type QualityReport,
  type QualityWindow,
  type RejectionItem,
} from "@/lib/admin/quality";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Rozmiar strony rowny max_rows PostgREST (supabase/config.toml). */
const PAGE_SIZE = 1000;

function readFailed(what: string, message: string): Error {
  return new Error(`Nie udalo sie odczytac ${what}: ${message}`);
}

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Wiersze artykulow z 60 dni moga przekroczyc limit max_rows, wiec czytamy stronami.
 * Kazda strona to nowe wywolanie funkcji, a pipeline miedzy nimi dopisuje artykuly do review,
 * wiec wiersz z konca strony moze wrocic na poczatku nastepnej. Duplikaty usuwamy po id,
 * zeby nie liczyc artykulu dwa razy.
 */
async function fetchArticles(supabase: ServerClient, since: Date): Promise<QualityArticle[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc("quality_report_articles", { p_since: since.toISOString() })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      throw readFailed("artykulow raportu jakosci", error.message);
    }
    rows.push(...data);
    if (data.length < PAGE_SIZE) {
      break;
    }
  }
  const unique = new Map(toQualityArticles(rows).map((article) => [article.id, article]));
  return [...unique.values()];
}

export interface QualityReportData {
  report: QualityReport;
  rejections: RejectionItem[];
}

/**
 * Odczyt na sesji redaktora. audit_log i llm_calls sa tylko dla admina, wiec powody
 * odrzucen i koszt ida przez funkcje z migracji 0028, ktore same sprawdzaja is_editor().
 */
export async function getQualityReport(
  now: Date,
  windowDays: QualityWindow,
): Promise<QualityReportData> {
  const supabase = await createSupabaseServerClient();

  const [articles, totals, categories] = await Promise.all([
    fetchArticles(supabase, daysAgo(now, QUALITY_FETCH_DAYS)),
    supabase.rpc("quality_report_category_totals", {
      p_since: daysAgo(now, windowDays).toISOString(),
    }),
    supabase.from("categories").select("id, name").order("position").order("name"),
  ]);

  if (totals.error) {
    throw readFailed("kosztow raportu jakosci", totals.error.message);
  }
  if (categories.error) {
    throw readFailed("kategorii", categories.error.message);
  }

  const categoryList: QualityCategory[] = categories.data;

  return {
    report: buildQualityReport(
      articles,
      toQualityTotals(totals.data),
      categoryList,
      now,
      windowDays,
    ),
    rejections: listRejections(articles, categoryList, now, windowDays),
  };
}
