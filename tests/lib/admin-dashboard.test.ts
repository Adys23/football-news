import { describe, expect, it } from "vitest";
import {
  ACTIVE_STORY_STATUSES,
  countConflicts,
  hoursAgo,
  sortReviewQueue,
  startOfDayInZone,
  type ReviewQueueItem,
} from "@/lib/admin/dashboard";
import {
  PUBLISHABILITY_LABELS,
  STORY_STATUS_LABELS,
  eventTypeLabel,
  formatScore,
} from "@/lib/admin/labels";

function item(overrides: Partial<ReviewQueueItem>): ReviewQueueItem {
  return {
    articleId: "a",
    title: "Tytul",
    createdAt: "2026-09-28T08:00:00Z",
    eventType: "transfer",
    importance: 50,
    confidence: 0.8,
    publishability: "review",
    conflicts: 0,
    quality: 0.9,
    clickbait: 0.05,
    unsupportedClaims: 0,
    ...overrides,
  };
}

describe("startOfDayInZone", () => {
  it("zima: polnoc w Warszawie to 23:00 UTC poprzedniego dnia", () => {
    expect(startOfDayInZone(new Date("2026-01-15T12:00:00Z")).toISOString()).toBe(
      "2026-01-14T23:00:00.000Z",
    );
  });

  it("lato: polnoc w Warszawie to 22:00 UTC poprzedniego dnia", () => {
    expect(startOfDayInZone(new Date("2026-07-15T12:00:00Z")).toISOString()).toBe(
      "2026-07-14T22:00:00.000Z",
    );
  });

  it("tuz po polnocy w Warszawie liczy juz nowy dzien, choc w UTC jest poprzedni", () => {
    expect(startOfDayInZone(new Date("2026-07-15T22:30:00Z")).toISOString()).toBe(
      "2026-07-15T22:00:00.000Z",
    );
  });

  it("dzien zmiany na czas letni: polnoc ma jeszcze offset zimowy", () => {
    expect(startOfDayInZone(new Date("2026-03-29T12:00:00Z")).toISOString()).toBe(
      "2026-03-28T23:00:00.000Z",
    );
  });

  it("dzien zmiany na czas zimowy: polnoc ma jeszcze offset letni", () => {
    expect(startOfDayInZone(new Date("2026-10-25T12:00:00Z")).toISOString()).toBe(
      "2026-10-24T22:00:00.000Z",
    );
  });

  it("dziala dla innej strefy", () => {
    expect(startOfDayInZone(new Date("2026-07-15T12:00:00Z"), "UTC").toISOString()).toBe(
      "2026-07-15T00:00:00.000Z",
    );
  });
});

describe("hoursAgo", () => {
  it("cofa o podana liczbe godzin", () => {
    expect(hoursAgo(new Date("2026-09-28T12:00:00Z"), 24).toISOString()).toBe(
      "2026-09-27T12:00:00.000Z",
    );
  });
});

describe("sortReviewQueue", () => {
  it("najpierw waga malejaco", () => {
    const sorted = sortReviewQueue([
      item({ articleId: "low", importance: 40 }),
      item({ articleId: "high", importance: 90 }),
    ]);
    expect(sorted.map((i) => i.articleId)).toEqual(["high", "low"]);
  });

  it("przy rownej wadze pewnosc malejaco, a brak oceny na koncu", () => {
    const sorted = sortReviewQueue([
      item({ articleId: "none", confidence: null }),
      item({ articleId: "mid", confidence: 0.7 }),
      item({ articleId: "top", confidence: 0.95 }),
    ]);
    expect(sorted.map((i) => i.articleId)).toEqual(["top", "mid", "none"]);
  });

  it("przy remisie wyzej to, co dluzej czeka", () => {
    const sorted = sortReviewQueue([
      item({ articleId: "later", createdAt: "2026-09-28T10:00:00Z" }),
      item({ articleId: "earlier", createdAt: "2026-09-28T09:00:00Z" }),
    ]);
    expect(sorted.map((i) => i.articleId)).toEqual(["earlier", "later"]);
  });

  it("nie modyfikuje wejscia", () => {
    const input = [
      item({ articleId: "b", importance: 10 }),
      item({ articleId: "a", importance: 20 }),
    ];
    sortReviewQueue(input);
    expect(input.map((i) => i.articleId)).toEqual(["b", "a"]);
  });
});

describe("countConflicts", () => {
  it("liczy elementy tablicy", () => {
    expect(countConflicts([{ severity: "high" }, { severity: "low" }])).toBe(2);
  });

  it("brak lub nieoczekiwany ksztalt to zero", () => {
    expect(countConflicts(undefined)).toBe(0);
    expect(countConflicts(null)).toBe(0);
    expect(countConflicts({ severity: "high" })).toBe(0);
  });
});

describe("etykiety panelu", () => {
  it("kazdy aktywny status historii ma polska etykiete", () => {
    for (const status of ACTIVE_STORY_STATUSES) {
      expect(STORY_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("aktywne statusy nie obejmuja zakonczonych historii", () => {
    expect(ACTIVE_STORY_STATUSES).not.toContain("published");
    expect(ACTIVE_STORY_STATUSES).not.toContain("rejected");
    expect(ACTIVE_STORY_STATUSES).not.toContain("blocked");
  });

  it("publishability ma etykiety dla wszystkich wartosci", () => {
    expect(Object.keys(PUBLISHABILITY_LABELS).sort()).toEqual(["auto", "reject", "review"]);
  });

  it("nieznany typ wydarzenia pokazuje surowa wartosc", () => {
    expect(eventTypeLabel("match_result")).toBe("Wynik meczu");
    expect(eventTypeLabel("nieznany")).toBe("nieznany");
  });

  it("formatScore zaokragla do procent, a brak to myslnik", () => {
    expect(formatScore(0.874)).toBe("87%");
    expect(formatScore(0)).toBe("0%");
    expect(formatScore(null)).toBe("—");
  });
});
