/**
 * Deterministyczna kontrola tytulow.
 *
 * Model ocenia clickbait osobno, ale w tej jednej sprawie nie polegamy wylacznie
 * na LLM: zakazane frazy i formalne wymogi sprawdzamy w kodzie, bo maja byc
 * przewidywalne i testowalne.
 */

export const MAX_TITLE_LENGTH = 70;
export const MIN_TITLE_LENGTH = 15;

export const BANNED_PHRASES = [
  "szok",
  "szokujac",
  "hit",
  "bomba",
  "nie uwierzysz",
  "to koniec",
  "sensacja",
  "kosmiczn",
  "musisz to",
  "zobacz co",
  "oto dlaczego",
  "wszyscy mowia",
] as const;

export type TitleIssueCode =
  | "too_short"
  | "too_long"
  | "exclamation"
  | "question"
  | "banned_phrase"
  | "shouting"
  | "no_entity";

export type TitleIssue = {
  code: TitleIssueCode;
  message: string;
};

export type TitleCheckResult = {
  ok: boolean;
  issues: TitleIssue[];
};

export type TitleCheckOptions = {
  /** Nazwy zawodnikow i klubow rozpoznane w historii. Tytul musi zawierac co najmniej jedna. */
  knownEntities?: string[];
};

function normalizeForMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function checkTitle(title: string, options: TitleCheckOptions = {}): TitleCheckResult {
  const issues: TitleIssue[] = [];
  const trimmed = title.trim();
  const normalized = normalizeForMatching(trimmed);

  if (trimmed.length < MIN_TITLE_LENGTH) {
    issues.push({
      code: "too_short",
      message: `Tytul ma ${trimmed.length} znakow, minimum to ${MIN_TITLE_LENGTH}.`,
    });
  }

  if (trimmed.length > MAX_TITLE_LENGTH) {
    issues.push({
      code: "too_long",
      message: `Tytul ma ${trimmed.length} znakow, maksimum to ${MAX_TITLE_LENGTH}.`,
    });
  }

  if (trimmed.includes("!")) {
    issues.push({ code: "exclamation", message: "Wykrzyknik w tytule jest zabroniony." });
  }

  if (trimmed.endsWith("?")) {
    issues.push({ code: "question", message: "Pytanie retoryczne w tytule jest zabronione." });
  }

  const banned = BANNED_PHRASES.find((phrase) => normalized.includes(phrase));
  if (banned) {
    issues.push({ code: "banned_phrase", message: `Tytul zawiera zakazana fraze: "${banned}".` });
  }

  // Krzyk wielkimi literami. Skroty do trzech znakow (FC, PSG, UEFA ma 4) sa dozwolone.
  const shouting = trimmed
    .split(/\s+/)
    .some((word) => word.length > 4 && word === word.toUpperCase() && /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(word));

  if (shouting) {
    issues.push({ code: "shouting", message: "Wyraz zapisany samymi wielkimi literami." });
  }

  const entities = options.knownEntities ?? [];
  if (entities.length > 0) {
    const hasEntity = entities.some((entity) => {
      const needle = normalizeForMatching(entity).trim();
      return needle.length > 0 && normalized.includes(needle);
    });

    if (!hasEntity) {
      issues.push({
        code: "no_entity",
        message: "Tytul nie zawiera nazwy zawodnika ani klubu.",
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
