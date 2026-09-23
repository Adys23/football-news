import { describe, expect, it } from "vitest";
import { copiedFragments } from "@shared/lib/copy-detect.ts";

const SOURCE =
  "Klub potwierdzil w komunikacie, ze pomocnik podpisal nowa umowe obowiazujaca do 2027 roku.";

describe("copiedFragments", () => {
  it("wykrywa 8 kolejnych slow wspolnych ze zrodlem mimo roznic w diakrytykach i interpunkcji", () => {
    const article =
      "Jak podano, pomocnik podpisał nową umowę, obowiązującą do 2027 roku. Reszta tekstu.";

    expect(copiedFragments(article, [SOURCE])).toEqual([
      "pomocnik podpisal nowa umowe obowiazujaca do 2027 roku",
    ]);
  });

  it("nie zglasza wspolnych fragmentow krotszych niz 8 slow", () => {
    const article = "Pomocnik podpisal nowa umowe z klubem, ktora obowiazuje do 2027 roku.";

    expect(copiedFragments(article, [SOURCE])).toEqual([]);
  });

  it("zbiera trafienia ze wszystkich zrodel bez powtorzen", () => {
    const article = SOURCE;

    expect(copiedFragments(article, [SOURCE, SOURCE, ""]).length).toBeGreaterThan(1);
    expect(new Set(copiedFragments(article, [SOURCE, SOURCE])).size).toBe(
      copiedFragments(article, [SOURCE]).length,
    );
  });
});
