import { describe, expect, it } from "vitest";
import { checkTitle, MAX_TITLE_LENGTH } from "@shared/lib/title-guard.ts";

const codesOf = (title: string, knownEntities?: string[]) =>
  checkTitle(title, knownEntities ? { knownEntities } : {}).issues.map((issue) => issue.code);

describe("checkTitle", () => {
  it("przepuszcza rzeczowy tytul informacyjny", () => {
    const result = checkTitle("Bruno Fernandes przedluzyl kontrakt z Manchesterem United", {
      knownEntities: ["Bruno Fernandes", "Manchester United"],
    });

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("odrzuca wykrzyknik", () => {
    expect(codesOf("Lewandowski zmienia klub!")).toContain("exclamation");
  });

  it("odrzuca pytanie retoryczne", () => {
    expect(codesOf("Czy Lewandowski odejdzie z Barcelony?")).toContain("question");
  });

  it("odrzuca zakazane frazy niezaleznie od ogonkow", () => {
    expect(codesOf("Szokująca decyzja zarzadu Legii Warszawa")).toContain("banned_phrase");
    expect(codesOf("Nie uwierzysz, co zrobil Lech Poznan")).toContain("banned_phrase");
  });

  it("odrzuca krzyk wielkimi literami, ale dopuszcza skroty", () => {
    expect(codesOf("Lewandowski OFICJALNIE zmienia klub w Barcelonie")).toContain("shouting");
    expect(codesOf("FC Barcelona ogłosiła transfer nowego napastnika")).not.toContain("shouting");
  });

  it("pilnuje dlugosci w obie strony", () => {
    expect(codesOf("Krotko")).toContain("too_short");
    expect(codesOf("a".repeat(MAX_TITLE_LENGTH + 1))).toContain("too_long");
  });

  it("wymaga nazwy zawodnika lub klubu, gdy znamy encje historii", () => {
    expect(codesOf("Zaskakujaca decyzja przed niedzielnym spotkaniem", ["Lech Poznan"])).toContain(
      "no_entity",
    );
    expect(
      codesOf("Lech Poznan zremisowal z Legia Warszawa w derbach", ["Lech Poznan"]),
    ).not.toContain("no_entity");
  });

  it("nie sprawdza encji, gdy lista jest pusta", () => {
    expect(codesOf("Spokojny tytul bez nazw wlasnych w tresci", [])).not.toContain("no_entity");
  });

  it("zbiera wszystkie naruszenia jednoczesnie", () => {
    const codes = codesOf("SZOKUJACE! Nie uwierzysz, co sie stalo?");

    expect(codes).toEqual(
      expect.arrayContaining(["exclamation", "question", "banned_phrase", "shouting"]),
    );
  });
});
