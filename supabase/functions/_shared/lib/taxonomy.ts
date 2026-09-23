export type StoryEventType = "transfer" | "injury" | "match_result" | "contract" | "other";

const TRANSFER = /\b(transfer|transfers|przechodzi|sprzedaz|kupno|negotiat|here we go)\b/i;
const CONTRACT = /\b(contract|kontrakt|przedluz|extension|signs? new|pens new deal)\b/i;
const INJURY = /\b(injur|kontuz|out for|hamstring|acl)\b/i;
const MATCH = /\b(vs\.?|wygral\w*|przegr\w*|remis|match result|final score)\b/i;

export function classifyEventType(title: string): StoryEventType {
  if (TRANSFER.test(title)) {
    return "transfer";
  }
  if (CONTRACT.test(title)) {
    return "contract";
  }
  if (INJURY.test(title)) {
    return "injury";
  }
  if (MATCH.test(title)) {
    return "match_result";
  }

  return "other";
}

export function categorySlugForEvent(
  eventType: StoryEventType,
  mentionedClubCountries: string[],
): string {
  if (eventType === "transfer") {
    return "transfery";
  }

  if (mentionedClubCountries.includes("pl")) {
    return "ekstraklasa";
  }

  return "pilka-nozna";
}

/** Od tej wagi historia jest pilna: pisze model eskalacyjny, a panel wyroznia ja osobno. */
export const HIGH_IMPORTANCE = 80;

export function importanceFromTrust(trustScore: number): number {
  return Math.max(0, Math.min(100, Math.round(trustScore * 100)));
}
