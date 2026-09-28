import { describe, expect, it } from "vitest";
import {
  JOB_ERROR_PREVIEW_CHARS,
  jobTarget,
  jobTimeline,
  latestErrorBySource,
  previewError,
  requeueErrorMessage,
  requeueJobInputSchema,
  sourceHealth,
  sourceToggleUpdate,
  toOpsJobs,
  toSourceHealthItems,
  toggleSourceInputSchema,
  type OpsJobRow,
  type SourceHealthRow,
} from "@/lib/admin/ops";

const JOB_ID = "6f1c1f4e-3a52-4c1e-9d5e-0b9a3c2d1e0f";

function row(overrides: Partial<OpsJobRow>): OpsJobRow {
  return {
    id: JOB_ID,
    type: "EXTRACT_FACTS",
    status: "dead",
    attempts: 3,
    max_attempts: 3,
    error: "Model zwrocil niepoprawny JSON",
    created_at: "2026-09-28T08:00:00Z",
    processed_at: "2026-09-28T08:05:00Z",
    next_run_at: "2026-09-28T08:03:00Z",
    story_id: null,
    article_id: null,
    ...overrides,
  };
}

describe("jobTimeline", () => {
  it("martwy job pokazuje chwile przejscia do dead", () => {
    expect(jobTimeline(row({}))).toEqual({ label: "martwy od", at: "2026-09-28T08:05:00Z" });
  });

  it("martwy job bez processed_at spada na created_at", () => {
    expect(jobTimeline(row({ processed_at: null })).at).toBe("2026-09-28T08:00:00Z");
  });

  it("failed pokazuje termin kolejnej proby", () => {
    expect(jobTimeline(row({ status: "failed", processed_at: null }))).toEqual({
      label: "następna próba",
      at: "2026-09-28T08:03:00Z",
    });
  });
});

describe("jobTarget", () => {
  it("artykul ma pierwszenstwo przed historia", () => {
    expect(jobTarget(row({ article_id: "a1", story_id: "s1" }))).toEqual({
      label: "artykuł",
      href: "/admin/artykuly/a1",
    });
  });

  it("sama historia prowadzi do listy historii", () => {
    expect(jobTarget(row({ story_id: "s1" }))?.href).toBe("/admin/historie");
  });

  it("job bez powiazan nie ma linku", () => {
    expect(jobTarget(row({}))).toBeNull();
  });
});

describe("previewError", () => {
  it("krotki blad zostaje bez zmian, brak bledu to null", () => {
    expect(previewError("HTTP 503")).toBe("HTTP 503");
    expect(previewError(null)).toBeNull();
    expect(previewError("")).toBeNull();
  });

  it("dlugi blad jest przyciety z wielokropkiem", () => {
    const preview = previewError("x".repeat(JOB_ERROR_PREVIEW_CHARS + 50));
    expect(preview).toHaveLength(JOB_ERROR_PREVIEW_CHARS + 1);
    expect(preview?.endsWith("…")).toBe(true);
  });
});

describe("toOpsJobs", () => {
  it("mapuje wiersze i pomija statusy spoza widoku", () => {
    const jobs = toOpsJobs([row({}), row({ id: "done", status: "done" })]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: JOB_ID,
      status: "dead",
      attempts: 3,
      maxAttempts: 3,
      error: "Model zwrocil niepoprawny JSON",
      target: null,
    });
  });
});

describe("requeueJobInputSchema", () => {
  it("przyjmuje uuid i odrzuca inne wartosci", () => {
    expect(requeueJobInputSchema.safeParse({ jobId: JOB_ID }).success).toBe(true);
    expect(requeueJobInputSchema.safeParse({ jobId: "1; drop table jobs" }).success).toBe(false);
    expect(requeueJobInputSchema.safeParse({ jobId: null }).success).toBe(false);
  });
});

describe("requeueErrorMessage", () => {
  it("konflikt dedupe_key tlumaczy jako nowszy job w kolejce", () => {
    expect(requeueErrorMessage({ code: "23505", message: "duplicate key value" })).toContain(
      "nowszy job",
    );
  });

  it("inne bledy przekazuje z trescia", () => {
    expect(requeueErrorMessage({ code: "42501", message: "Tylko administrator" })).toBe(
      "Nie udało się ponowić joba: Tylko administrator",
    );
  });
});

function source(overrides: Partial<SourceHealthRow>): SourceHealthRow {
  return {
    id: "s1",
    name: "Legia",
    type: "official_club",
    trust_score: 1,
    active: true,
    consecutive_failures: 0,
    last_checked_at: "2026-09-28T08:00:00Z",
    last_success_at: "2026-09-28T08:00:00Z",
    ...overrides,
  };
}

describe("sourceHealth", () => {
  it("rozroznia breaker, reczne wylaczenie, bledy i zdrowe zrodlo", () => {
    expect(sourceHealth({ active: false, consecutive_failures: 10 })).toBe("tripped");
    expect(sourceHealth({ active: false, consecutive_failures: 2 })).toBe("disabled");
    expect(sourceHealth({ active: true, consecutive_failures: 3 })).toBe("degraded");
    expect(sourceHealth({ active: true, consecutive_failures: 0 })).toBe("ok");
  });
});

describe("latestErrorBySource", () => {
  it("bierze pierwszy (najnowszy) blad kazdego zrodla i pomija puste", () => {
    const errors = latestErrorBySource([
      { source_id: "s1", error: "HTTP 503" },
      { source_id: "s1", error: "stary" },
      { source_id: null, error: "bez zrodla" },
      { source_id: "s2", error: null },
    ]);
    expect([...errors]).toEqual([["s1", "HTTP 503"]]);
  });
});

describe("toSourceHealthItems", () => {
  it("stawia problemy na gorze i pokazuje blad tylko przy problemie", () => {
    const items = toSourceHealthItems(
      [
        source({ id: "a", name: "Zdrowe" }),
        source({ id: "b", name: "Breaker", active: false, consecutive_failures: 10 }),
        source({ id: "c", name: "Awaryjne", consecutive_failures: 1 }),
      ],
      new Map([
        ["b", "HTTP 404"],
        ["a", "stary blad sprzed naprawy"],
      ]),
    );
    expect(items.map((item) => [item.id, item.health, item.lastError])).toEqual([
      ["b", "tripped", "HTTP 404"],
      ["c", "degraded", null],
      ["a", "ok", null],
    ]);
  });
});

describe("toggleSourceInputSchema i sourceToggleUpdate", () => {
  it("parsuje docelowy stan z formularza", () => {
    expect(toggleSourceInputSchema.parse({ sourceId: JOB_ID, active: "true" }).active).toBe(true);
    expect(toggleSourceInputSchema.parse({ sourceId: JOB_ID, active: "false" }).active).toBe(false);
    expect(toggleSourceInputSchema.safeParse({ sourceId: JOB_ID, active: "tak" }).success).toBe(
      false,
    );
  });

  it("wlaczenie zeruje licznik bledow, wylaczenie go nie rusza", () => {
    expect(sourceToggleUpdate(true)).toEqual({ active: true, consecutive_failures: 0 });
    expect(sourceToggleUpdate(false)).toEqual({ active: false });
  });
});
