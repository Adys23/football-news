import { describe, expect, it } from "vitest";
import { redirectPathFromRow } from "@/lib/public/redirect-path";
import { revalidationTags } from "@/lib/public/revalidate-webhook";
import { CACHE_TAGS } from "@/lib/public/cache-tags";

describe("redirectPathFromRow", () => {
  it("prowadzi na aktualny slug w aktualnej kategorii", () => {
    expect(
      redirectPathFromRow("stary-slug", {
        slug: "nowy-slug",
        status: "published",
        categories: { slug: "transfery" },
      }),
    ).toBe("/transfery/nowy-slug");
  });

  it("bez kategorii uzywa kategorii domyslnej, jak sciezka kanoniczna", () => {
    expect(
      redirectPathFromRow("stary-slug", {
        slug: "nowy-slug",
        status: "published",
        categories: null,
      }),
    ).toBe("/pilka-nozna/nowy-slug");
  });

  it("nie przekierowuje na artykul wycofany z publikacji", () => {
    expect(
      redirectPathFromRow("stary-slug", {
        slug: "nowy-slug",
        status: "archived",
        categories: { slug: "transfery" },
      }),
    ).toBeNull();
  });

  it("nie tworzy petli, gdy wpis wskazuje aktualny slug", () => {
    expect(
      redirectPathFromRow("ten-sam", {
        slug: "ten-sam",
        status: "published",
        categories: { slug: "transfery" },
      }),
    ).toBeNull();
  });
});

describe("uniewaznianie cache przekierowania", () => {
  it("zmiana sluga uniewaznia tag starego sluga, pod ktorym jest zapytanie o przekierowanie", () => {
    const tags = revalidationTags({
      event: "update",
      slug: "nowy-slug",
      previous_slug: "stary-slug",
    });

    expect(tags).toContain(CACHE_TAGS.article("stary-slug"));
    expect(tags).toContain(CACHE_TAGS.articles);
  });

  it("kazda zmiana opublikowanego artykulu uniewaznia tag articles (kolejne zmiany sluga)", () => {
    expect(revalidationTags({ event: "unpublish", slug: "nowy-slug" })).toContain(
      CACHE_TAGS.articles,
    );
  });
});
