import type { Enums, Json } from "@contracts/index.ts";
import { HIGH_IMPORTANCE } from "@shared/lib/taxonomy.ts";

/**
 * Prog "Pilne" w panelu, wspolny z eskalacja modelu w GENERATE_ARTICLE.
 * Stala w kodzie, a nie w settings, bo settings sa dla redaktora niewidoczne przez RLS.
 */
export const URGENT_IMPORTANCE = HIGH_IMPORTANCE;
export const URGENT_WINDOW_HOURS = 24;
export const URGENT_LIMIT = 10;
export const NEW_STORIES_WINDOW_HOURS = 24;
/**
 * PostgREST sortuje po wadze przed limitem, ale nie po pewnosci z zagniezdzonej oceny.
 * Doplyw do review ogranicza max_articles_per_hour, wiec limit w praktyce nie tnie kolejki.
 */
export const REVIEW_QUEUE_LIMIT = 200;
export const NEWSROOM_TIME_ZONE = "Europe/Warsaw";

/** Historie jeszcze nieopublikowane i nieodrzucone - tylko takie moga byc pilne. */
export const ACTIVE_STORY_STATUSES = [
  "new",
  "clustering",
  "extracting",
  "validating",
  "drafting",
  "review",
  "approved",
] as const satisfies readonly Enums<"story_status">[];

export function hoursAgo(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);

  const asUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Polnoc biezacego dnia w podanej strefie, jako chwila w UTC. */
export function startOfDayInZone(now: Date, timeZone: string = NEWSROOM_TIME_ZONE): Date {
  const local = new Date(now.getTime() + zoneOffsetMs(now, timeZone));
  const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // Offset liczony dla samej polnocy, bo w dniu zmiany czasu rozni sie od offsetu "teraz".
  const guess = midnightAsUtc - zoneOffsetMs(new Date(midnightAsUtc), timeZone);
  return new Date(midnightAsUtc - zoneOffsetMs(new Date(guess), timeZone));
}

export interface ReviewQueueItem {
  articleId: string;
  title: string;
  createdAt: string;
  eventType: string;
  importance: number;
  confidence: number | null;
  publishability: Enums<"publishability"> | null;
  conflicts: number;
  quality: number | null;
  clickbait: number | null;
  unsupportedClaims: number | null;
}

/** Waga malejaco, potem pewnosc oceny malejaco, potem dluzej czekajace wyzej. */
export function sortReviewQueue(items: readonly ReviewQueueItem[]): ReviewQueueItem[] {
  return [...items].sort(
    (a, b) =>
      b.importance - a.importance ||
      (b.confidence ?? 0) - (a.confidence ?? 0) ||
      Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

/** Liczba sprzecznosci zapisanych przez VALIDATE_FACTS. Nieoczekiwany ksztalt to zero. */
export function countConflicts(conflicts: Json | undefined): number {
  return Array.isArray(conflicts) ? conflicts.length : 0;
}
