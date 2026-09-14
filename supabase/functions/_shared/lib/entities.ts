import { normalizeTitle } from "./hash.ts";

export type EntityHit = {
  type: "player" | "club";
  id: string;
  name: string;
};

export type EntityRecord = {
  id: string;
  name: string;
  aliases: string[] | null;
};

/** Czy znormalizowany tekst zawiera alias jako caly token (dluzsze aliasy pierwsze). */
export function textMentionsEntity(text: string, entity: EntityRecord): boolean {
  const haystack = ` ${normalizeTitle(text)} `;
  const labels = [entity.name, ...(entity.aliases ?? [])]
    .map((label) => normalizeTitle(label))
    .filter((label) => label.length >= 3)
    .sort((a, b) => b.length - a.length);

  return labels.some((label) => haystack.includes(` ${label} `));
}

export function findMentionedEntities(
  text: string,
  players: EntityRecord[],
  clubs: EntityRecord[],
): EntityHit[] {
  const hits: EntityHit[] = [];

  for (const player of players) {
    if (textMentionsEntity(text, player)) {
      hits.push({ type: "player", id: player.id, name: player.name });
    }
  }

  for (const club of clubs) {
    if (textMentionsEntity(text, club)) {
      hits.push({ type: "club", id: club.id, name: club.name });
    }
  }

  return hits;
}

export function shareEntity(left: EntityHit[], right: EntityHit[]): boolean {
  return left.some((hit) => right.some((other) => other.type === hit.type && other.id === hit.id));
}
