import type { Enums } from "@contracts/index.ts";
import { NEWSROOM_TIME_ZONE } from "@/lib/admin/dashboard";

export const STORY_STATUS_LABELS: Record<Enums<"story_status">, string> = {
  new: "Nowa",
  clustering: "Grupowanie",
  extracting: "Ekstrakcja faktów",
  validating: "Ocena faktów",
  drafting: "Pisanie draftu",
  review: "Do weryfikacji",
  approved: "Zaakceptowana",
  published: "Opublikowana",
  rejected: "Odrzucona",
  blocked: "Zablokowana",
};

export const ARTICLE_STATUS_LABELS: Record<Enums<"article_status">, string> = {
  draft: "Szkic",
  review: "Do weryfikacji",
  approved: "Zaakceptowany",
  published: "Opublikowany",
  rejected: "Odrzucony",
  archived: "Zarchiwizowany",
};

export const SOURCE_TYPE_LABELS: Record<Enums<"source_type">, string> = {
  official_club: "Oficjalny klub",
  official_league: "Oficjalna liga",
  official_federation: "Federacja",
  journalist: "Dziennikarz",
  major_outlet: "Duży serwis",
  local_outlet: "Serwis lokalny",
  aggregator: "Agregator",
  social: "Media społecznościowe",
};

export const SEVERITY_LABELS: Record<"low" | "medium" | "high", string> = {
  low: "niska",
  medium: "średnia",
  high: "wysoka",
};

export const PUBLISHABILITY_LABELS: Record<Enums<"publishability">, string> = {
  auto: "Szybka ścieżka",
  review: "Wymaga uwagi",
  reject: "Do odrzucenia",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  transfer: "Transfer",
  injury: "Kontuzja",
  match_result: "Wynik meczu",
  contract: "Kontrakt",
  other: "Inne",
};

export function eventTypeLabel(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType;
}

/** 0.87 -> "87%". Brak wartosci to myslnik, nie zero. */
export function formatScore(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

const timeFormat = new Intl.DateTimeFormat("pl-PL", {
  timeZone: NEWSROOM_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatNewsroomTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}
