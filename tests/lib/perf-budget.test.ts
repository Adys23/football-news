import { describe, expect, it } from "vitest";
import {
  computeCls,
  evaluateBudgets,
  findArticlePath,
  kbpsToBytesPerSecond,
  latestLcp,
  median,
  PERF_BUDGETS,
  resolveChromePath,
} from "@/scripts/lib/perf-budget.mjs";

describe("computeCls", () => {
  it("bez przesuniec daje 0", () => {
    expect(computeCls([])).toBe(0);
  });

  it("sumuje przesuniecia w jednym oknie sesji", () => {
    const cls = computeCls([
      { value: 0.02, startTime: 100, hadRecentInput: false },
      { value: 0.03, startTime: 600, hadRecentInput: false },
    ]);
    expect(cls).toBeCloseTo(0.05);
  });

  it("przerwa co najmniej 1 s otwiera nowe okno, wynik to najwieksze okno", () => {
    const cls = computeCls([
      { value: 0.04, startTime: 100, hadRecentInput: false },
      { value: 0.01, startTime: 1200, hadRecentInput: false },
      { value: 0.02, startTime: 1500, hadRecentInput: false },
    ]);
    expect(cls).toBeCloseTo(0.04);
  });

  it("okno konczy sie po 5 s nawet przy ciaglych przesunieciach", () => {
    const shifts = Array.from({ length: 12 }, (_, index) => ({
      value: 0.01,
      startTime: index * 500,
      hadRecentInput: false,
    }));
    expect(computeCls(shifts)).toBeCloseTo(0.1);
  });

  it("pomija przesuniecia tuz po interakcji", () => {
    expect(computeCls([{ value: 0.5, startTime: 100, hadRecentInput: true }])).toBe(0);
  });
});

describe("latestLcp", () => {
  it("bierze ostatniego kandydata", () => {
    expect(
      latestLcp([
        { startTime: 300, element: "h1" },
        { startTime: 900, element: "img" },
      ]),
    ).toEqual({ startTime: 900, element: "img" });
  });

  it("bez kandydatow zwraca null", () => {
    expect(latestLcp([])).toBeNull();
  });
});

describe("median", () => {
  it("liczy mediane dla nieparzystej i parzystej liczby probek", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("evaluateBudgets", () => {
  it("budzety z architektury: LCP < 2 s, CLS < 0,1", () => {
    expect(PERF_BUDGETS).toEqual({ lcpMs: 2000, cls: 0.1 });
  });

  it("granica budzetu to juz przekroczenie", () => {
    const report = evaluateBudgets([
      { path: "/", lcpMs: 1999, cls: 0.099 },
      { path: "/transfery", lcpMs: 2000, cls: 0 },
      { path: "/transfery/a", lcpMs: 1000, cls: 0.1 },
    ]);
    expect(report.rows.map((row) => row.ok)).toEqual([true, false, false]);
    expect(report.ok).toBe(false);
  });

  it("brak LCP nie spelnia budzetu", () => {
    const report = evaluateBudgets([{ path: "/", lcpMs: null, cls: 0 }]);
    expect(report.rows[0]?.lcpOk).toBe(false);
    expect(report.ok).toBe(false);
  });
});

describe("kbpsToBytesPerSecond", () => {
  it("przelicza kilobity na bajty", () => {
    expect(kbpsToBytesPerSecond(8)).toBe(1024);
  });
});

describe("resolveChromePath", () => {
  const files = new Set([
    "/opt/pw-browsers",
    "/opt/pw-browsers/chromium-1100/chrome-linux/chrome",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/chrome",
  ]);
  const fs = {
    exists: (path: string) => files.has(path),
    list: () => ["ffmpeg-1011", "chromium-1100", "chromium_headless_shell-1194", "chromium-1194"],
  };

  it("CHROME_PATH ma pierwszenstwo", () => {
    expect(resolveChromePath({ CHROME_PATH: "/opt/chrome" }, fs)).toBe("/opt/chrome");
  });

  it("nieistniejacy CHROME_PATH to brak przegladarki, bez cichego zastepstwa", () => {
    expect(resolveChromePath({ CHROME_PATH: "/nie/ma" }, fs)).toBeNull();
  });

  it("wybiera najnowszy Chromium z katalogu Playwrighta", () => {
    expect(resolveChromePath({}, fs)).toBe("/opt/pw-browsers/chromium-1194/chrome-linux/chrome");
  });

  it("bez przegladarki zwraca null", () => {
    expect(resolveChromePath({}, { exists: () => false, list: () => [] })).toBeNull();
  });
});

describe("findArticlePath", () => {
  it("znajduje pierwszy link do artykulu i pomija zasoby Next.js", () => {
    const html =
      '<link href="/_next/static/a.css"><a href="/">Start</a><a href="/transfery/jan-kowalski-w-legii">Tekst</a>';
    expect(findArticlePath(html)).toBe("/transfery/jan-kowalski-w-legii");
  });

  it("bez linku zwraca null", () => {
    expect(findArticlePath('<a href="/">Start</a>')).toBeNull();
  });
});
