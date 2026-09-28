import { describe, expect, it } from "vitest";
import {
  ABOUT_PATH,
  EDITORIAL_POLICY_PATH,
  authorPath,
  clubPath,
  entityPath,
  playerPath,
} from "@/lib/public/paths";
import {
  AUTHOR_COLUMNS,
  ageOn,
  chunk,
  countryName,
  formatBirthDate,
  latestArticleByEntity,
  safeHttpsUrl,
  toPublicAuthor,
  toPublicClub,
  toPublicPlayer,
  yearsWord,
} from "@/lib/public/profiles-model";
import { isPublisherPlaceholder } from "@/lib/public/publisher";

describe("profile paths", () => {
  it("builds the routes from docs/architecture.md", () => {
    expect(playerPath("robert-lewandowski")).toBe("/zawodnicy/robert-lewandowski");
    expect(clubPath("legia-warszawa")).toBe("/kluby/legia-warszawa");
    expect(authorPath("jan-kowalski")).toBe("/autorzy/jan-kowalski");
    expect(entityPath("player", "a")).toBe("/zawodnicy/a");
    expect(entityPath("club", "b")).toBe("/kluby/b");
    expect(EDITORIAL_POLICY_PATH.startsWith(`${ABOUT_PATH}/`)).toBe(true);
  });
});

describe("row mapping", () => {
  it("maps a player with the current club", () => {
    expect(
      toPublicPlayer({
        id: "p1",
        name: "Lewandowski",
        slug: "robert-lewandowski",
        full_name: "Robert Lewandowski",
        country: "Polska",
        birth_date: "1988-08-21",
        position: "napastnik",
        clubs: { name: "FC Barcelona", slug: "fc-barcelona" },
      }),
    ).toEqual({
      id: "p1",
      name: "Lewandowski",
      slug: "robert-lewandowski",
      fullName: "Robert Lewandowski",
      country: "Polska",
      birthDate: "1988-08-21",
      position: "napastnik",
      club: { name: "FC Barcelona", slug: "fc-barcelona" },
    });
  });

  it("maps a club with its league name", () => {
    const club = toPublicClub({
      id: "c1",
      name: "Legia Warszawa",
      slug: "legia-warszawa",
      short_name: "Legia",
      country: "Polska",
      founded_year: 1916,
      leagues: { name: "Ekstraklasa" },
    });

    expect(club.leagueName).toBe("Ekstraklasa");
    expect(club.shortName).toBe("Legia");
    expect(toPublicClub({ ...clubRow(), leagues: null }).leagueName).toBeNull();
  });

  it("never selects the author's account link", () => {
    expect(AUTHOR_COLUMNS).not.toContain("profile_id");
  });

  it("drops a non-https author link", () => {
    const row = {
      id: "a1",
      name: "Jan Kowalski",
      slug: "jan-kowalski",
      bio: null,
      role_title: "Redaktor",
      x_url: "javascript:alert(1)",
    };

    expect(toPublicAuthor(row).xUrl).toBeNull();
    expect(toPublicAuthor({ ...row, x_url: "https://x.com/jan" }).xUrl).toBe("https://x.com/jan");
  });
});

function clubRow() {
  return {
    id: "c1",
    name: "Legia Warszawa",
    slug: "legia-warszawa",
    short_name: null,
    country: null,
    founded_year: null,
    leagues: null,
  };
}

describe("safeHttpsUrl", () => {
  it("accepts only valid https urls", () => {
    expect(safeHttpsUrl(null)).toBeNull();
    expect(safeHttpsUrl("")).toBeNull();
    expect(safeHttpsUrl("http://x.com/jan")).toBeNull();
    expect(safeHttpsUrl("nie adres")).toBeNull();
    expect(safeHttpsUrl("https://x.com/jan")).toBe("https://x.com/jan");
  });
});

describe("ageOn", () => {
  const now = new Date("2026-09-28T12:00:00Z");

  it("counts full years around the birthday", () => {
    expect(ageOn("2000-09-28", now)).toBe(26);
    expect(ageOn("2000-09-29", now)).toBe(25);
    expect(ageOn("2000-10-01", now)).toBe(25);
    expect(ageOn("2000-01-15", now)).toBe(26);
  });

  it("rejects malformed and future dates", () => {
    expect(ageOn("28.09.2000", now)).toBeNull();
    expect(ageOn("2030-01-01", now)).toBeNull();
  });
});

describe("formatBirthDate", () => {
  it("formats the date in Polish with the age", () => {
    const now = new Date("2026-09-28T12:00:00Z");

    expect(formatBirthDate("2004-01-15", now)).toBe("15 stycznia 2004 (22 lata)");
    expect(formatBirthDate("1988-08-21", now)).toBe("21 sierpnia 1988 (38 lat)");
    expect(formatBirthDate("zla-data", now)).toBe("zla-data");
  });
});

describe("countryName", () => {
  it("names ISO country codes in Polish and leaves other values untouched", () => {
    expect(countryName("pl")).toBe("Polska");
    expect(countryName("ES")).toBe("Hiszpania");
    expect(countryName("en")).toBe("en");
    expect(countryName("Anglia")).toBe("Anglia");
  });
});

describe("yearsWord", () => {
  it("follows Polish plural rules", () => {
    expect(yearsWord(1)).toBe("rok");
    expect(yearsWord(2)).toBe("lata");
    expect(yearsWord(5)).toBe("lat");
    expect(yearsWord(12)).toBe("lat");
    expect(yearsWord(22)).toBe("lata");
    expect(yearsWord(114)).toBe("lat");
  });
});

describe("latestArticleByEntity", () => {
  it("keeps the newest publication per entity and skips rows without a date", () => {
    const latest = latestArticleByEntity([
      { entity_id: "p1", articles: { published_at: "2026-09-01T10:00:00Z" } },
      { entity_id: "p1", articles: { published_at: "2026-09-20T10:00:00Z" } },
      { entity_id: "p1", articles: { published_at: "2026-09-10T10:00:00Z" } },
      { entity_id: "p2", articles: { published_at: null } },
      { entity_id: "p3", articles: null },
    ]);

    expect([...latest]).toEqual([["p1", "2026-09-20T10:00:00Z"]]);
  });
});

describe("chunk", () => {
  it("splits into slices of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe("publisher placeholders", () => {
  it("does not link unfilled contact data", () => {
    expect(isPublisherPlaceholder("[DO UZUPEŁNIENIA: adres e-mail redakcji]")).toBe(true);
    expect(isPublisherPlaceholder("redakcja@example.com")).toBe(false);
  });
});
