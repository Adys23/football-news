import { describe, expect, it } from "vitest";
import {
  blockImageIds,
  heroImageSelectionSchema,
  imageAttribution,
  licensedImage,
} from "@contracts/index.ts";

const ROW = {
  id: "77777777-7777-4777-8777-777777777771",
  kind: "hero",
  url: "https://project.supabase.co/storage/v1/object/public/article-images/a.jpg",
  width: 1600,
  height: 900,
  alt: "Stadion przy Łazienkowskiej",
  license: "CC BY 4.0",
  source: "PAP",
  photographer: "Jan Nowak",
  copyright: null,
  is_ai_generated: false,
};

describe("licensedImage", () => {
  it("mapuje obraz z licencja razem z atrybucja", () => {
    expect(licensedImage(ROW)).toEqual({
      id: ROW.id,
      kind: "hero",
      url: ROW.url,
      width: 1600,
      height: 900,
      alt: ROW.alt,
      attribution: "Fot. Jan Nowak / PAP, CC BY 4.0",
    });
  });

  it("odrzuca brak obrazu, brak licencji lub altu i obraz AI", () => {
    expect(licensedImage(null)).toBeNull();
    expect(licensedImage({ ...ROW, license: "  " })).toBeNull();
    expect(licensedImage({ ...ROW, alt: "" })).toBeNull();
    expect(licensedImage({ ...ROW, is_ai_generated: true })).toBeNull();
    expect(licensedImage({ ...ROW, width: 0 })).toBeNull();
  });
});

describe("imageAttribution", () => {
  const base = {
    photographer: null,
    copyright: null,
    source: "Klub",
    license: "Materiały prasowe",
  };

  it("sklada autora, wlasciciela praw i licencje", () => {
    expect(imageAttribution(base)).toBe("Klub, Materiały prasowe");
    expect(imageAttribution({ ...base, photographer: "Anna Lis" })).toBe(
      "Fot. Anna Lis / Klub, Materiały prasowe",
    );
    expect(imageAttribution({ ...base, photographer: "Anna Lis", copyright: "Legia" })).toBe(
      "Fot. Anna Lis / Legia, Materiały prasowe",
    );
  });

  it("traktuje puste pola jak brak", () => {
    const image = licensedImage({ ...ROW, photographer: "  ", copyright: "" });
    expect(image?.attribution).toBe("PAP, CC BY 4.0");
  });
});

describe("blockImageIds", () => {
  it("zwraca id obrazow z blokow bez powtorzen", () => {
    const a = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
    const b = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
    expect(
      blockImageIds([
        { type: "image", imageId: a },
        { type: "paragraph", text: "Tekst." },
        { type: "image", imageId: b, caption: "Podpis" },
        { type: "image", imageId: a },
      ]),
    ).toEqual([a, b]);
    expect(blockImageIds([{ type: "paragraph", text: "Tekst." }])).toEqual([]);
  });
});

describe("heroImageSelectionSchema", () => {
  it("pusty wybor to brak obrazu, inny napis musi byc uuid", () => {
    expect(heroImageSelectionSchema.parse("")).toBeNull();
    expect(heroImageSelectionSchema.parse(ROW.id)).toBe(ROW.id);
    expect(heroImageSelectionSchema.safeParse("hero").success).toBe(false);
  });
});
