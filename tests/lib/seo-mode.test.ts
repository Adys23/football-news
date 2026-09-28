import { describe, expect, it } from "vitest";
import { seoJobMode, seoRefreshDedupeKey } from "@shared/lib/seo-mode.ts";

const SEO = {
  seo_title: "Bruno Fernandes z kontraktem do 2028 roku",
  seo_description: "Opis SEO.",
};
const EMPTY_SEO = { seo_title: null, seo_description: null };

describe("seoJobMode", () => {
  it("szkic zawsze dostaje pelne metadane ze slugiem", () => {
    expect(seoJobMode({ status: "draft", ...SEO })).toBe("draft");
    expect(seoJobMode({ status: "draft", ...EMPTY_SEO })).toBe("draft");
  });

  it("odswieza puste SEO artykulu w recenzji i zatwierdzonego", () => {
    expect(seoJobMode({ status: "review", ...EMPTY_SEO })).toBe("refresh");
    expect(seoJobMode({ status: "approved", ...EMPTY_SEO })).toBe("refresh");
    expect(seoJobMode({ status: "review", ...SEO, seo_description: null })).toBe("refresh");
  });

  it("nie rusza uzupelnionego SEO ani artykulu poza recenzja", () => {
    expect(seoJobMode({ status: "review", ...SEO })).toBe("skip");
    for (const status of ["published", "rejected", "archived"] as const) {
      expect(seoJobMode({ status, ...EMPTY_SEO })).toBe("skip");
    }
  });
});

describe("seoRefreshDedupeKey", () => {
  it("jest staly dla artykulu, jak w enqueue_seo_refresh", () => {
    expect(seoRefreshDedupeKey("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01")).toBe(
      "GENERATE_SEO:refresh:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbd01",
    );
  });
});
