import { describe, expect, it } from "vitest";
import { findEntityStory, pickDedupeMatch } from "@shared/lib/dedupe.ts";
import { SEED } from "../factories/ids.ts";

describe("pickDedupeMatch", () => {
  it("najpierw trigram, potem encja, na koncu nowa historia", () => {
    expect(pickDedupeMatch([{ storyId: "a", similarity: 0.8 }], "b")).toEqual({
      kind: "trigram",
      storyId: "a",
      similarity: 0.8,
    });

    expect(pickDedupeMatch([], "b")).toEqual({
      kind: "entity",
      storyId: "b",
      similarity: null,
    });

    expect(pickDedupeMatch([], null)).toEqual({ kind: "new" });
  });
});

describe("findEntityStory", () => {
  const players = [{ id: SEED.players.fernandes, name: "Bruno Fernandes", aliases: ["Fernandes"] }];
  const clubs = [
    { id: SEED.clubs.manchesterUnited, name: "Manchester United", aliases: ["Man United"] },
  ];

  it("laczy historie ze wspolnym zawodnikiem", () => {
    const id = findEntityStory(
      "Bruno Fernandes zostaje w klubie",
      [{ id: "story-1", title: "Manchester United przedluza kontrakt Bruno Fernandes" }],
      players,
      clubs,
    );

    expect(id).toBe("story-1");
  });

  it("nie laczy, gdy brak wspolnej encji", () => {
    const id = findEntityStory(
      "Legia Warszawa wygrala derby",
      [{ id: "story-1", title: "Bruno Fernandes przedluzyl kontrakt" }],
      players,
      clubs,
    );

    expect(id).toBeNull();
  });
});
