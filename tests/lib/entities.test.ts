import { describe, expect, it } from "vitest";
import { findMentionedEntities, shareEntity, textMentionsEntity } from "@shared/lib/entities.ts";
import { SEED } from "../factories/ids.ts";

const united = {
  id: SEED.clubs.manchesterUnited,
  name: "Manchester United",
  aliases: ["Man United", "Man Utd", "United", "Red Devils"],
};

const fernandes = {
  id: SEED.players.fernandes,
  name: "Bruno Fernandes",
  aliases: ["Fernandes", "Bruno"],
};

describe("textMentionsEntity", () => {
  it("rozpoznaje dluzsza nazwe klubu, nie przypadkowe 'united' w srodku slowa", () => {
    expect(textMentionsEntity("Bruno Fernandes zostaje w Manchester United", united)).toBe(true);
    expect(textMentionsEntity("Reunited after years", united)).toBe(false);
  });
});

describe("findMentionedEntities", () => {
  it("znajduje zawodnika i klub w tytule", () => {
    const hits = findMentionedEntities(
      "Bruno Fernandes przedluzyl kontrakt z Manchesterem United",
      [fernandes],
      [united],
    );

    expect(hits.some((hit) => hit.type === "player" && hit.id === fernandes.id)).toBe(true);
    expect(hits.some((hit) => hit.type === "club" && hit.id === united.id)).toBe(true);
  });
});

describe("shareEntity", () => {
  it("wymaga wspolnego id", () => {
    const left = findMentionedEntities("Bruno Fernandes w United", [fernandes], [united]);
    const right = findMentionedEntities(
      "Manchester United przedluza kontrakt Bruno Fernandes",
      [fernandes],
      [united],
    );

    expect(shareEntity(left, right)).toBe(true);
    expect(shareEntity(left, [])).toBe(false);
  });
});
