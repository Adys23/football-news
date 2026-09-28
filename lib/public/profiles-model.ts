/**
 * Czysta logika profili zawodnikow, klubow i autorow: kolumny, mapowanie wierszy
 * i pomocnicze obliczenia. Zapytania sa w lib/public/profiles.ts.
 */

export const PLAYER_COLUMNS =
  "id, name, slug, full_name, country, birth_date, position, clubs(name, slug)";

export interface PlayerRow {
  id: string;
  name: string;
  slug: string;
  full_name: string | null;
  country: string | null;
  birth_date: string | null;
  position: string | null;
  clubs: { name: string; slug: string } | null;
}

export interface PublicPlayer {
  id: string;
  name: string;
  slug: string;
  fullName: string | null;
  country: string | null;
  birthDate: string | null;
  position: string | null;
  club: { name: string; slug: string } | null;
}

export function toPublicPlayer(row: PlayerRow): PublicPlayer {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    fullName: row.full_name,
    country: row.country,
    birthDate: row.birth_date,
    position: row.position,
    club: row.clubs,
  };
}

export const CLUB_COLUMNS = "id, name, slug, short_name, country, founded_year, leagues(name)";

export interface ClubRow {
  id: string;
  name: string;
  slug: string;
  short_name: string | null;
  country: string | null;
  founded_year: number | null;
  leagues: { name: string } | null;
}

export interface PublicClub {
  id: string;
  name: string;
  slug: string;
  shortName: string | null;
  country: string | null;
  foundedYear: number | null;
  leagueName: string | null;
}

export function toPublicClub(row: ClubRow): PublicClub {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    shortName: row.short_name,
    country: row.country,
    foundedYear: row.founded_year,
    leagueName: row.leagues?.name ?? null,
  };
}

/**
 * Tylko pola przeznaczone do publikacji. `profile_id` (powiazanie z kontem,
 * a przez nie z e-mailem i rola) swiadomie pomijamy.
 */
export const AUTHOR_COLUMNS = "id, name, slug, bio, role_title, x_url";

export interface AuthorRow {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  role_title: string | null;
  x_url: string | null;
}

export interface PublicAuthor {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  roleTitle: string | null;
  /** Tylko adres https; inny schemat (np. javascript:) nie trafia na strone. */
  xUrl: string | null;
}

export function toPublicAuthor(row: AuthorRow): PublicAuthor {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    bio: row.bio,
    roleTitle: row.role_title,
    xUrl: safeHttpsUrl(row.x_url),
  };
}

/** Zwraca adres tylko, gdy jest poprawnym URL-em https. */
export function safeHttpsUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Wiek w pelnych latach na dzien `now` (UTC), z data urodzenia `YYYY-MM-DD`. */
export function ageOn(birthDate: string, now: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  let age = now.getUTCFullYear() - year;
  const beforeBirthday =
    now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  if (beforeBirthday) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

const regionNames = new Intl.DisplayNames("pl", { type: "region" });

/** Kod kraju ISO 3166 ("pl") jako polska nazwa; inna wartosc zostaje bez zmian. */
export function countryName(value: string): string {
  if (!/^[a-z]{2}$/i.test(value)) {
    return value;
  }
  const code = value.toUpperCase();
  const name = regionNames.of(code);
  return name && name !== code ? name : value;
}

const birthDateFormat = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** "15 stycznia 2000 (26 lat)"; nieczytelna data zostaje bez zmian. */
export function formatBirthDate(birthDate: string, now: Date): string {
  const age = ageOn(birthDate, now);
  if (age === null) {
    return birthDate;
  }
  return `${birthDateFormat.format(new Date(`${birthDate}T00:00:00Z`))} (${age} ${yearsWord(age)})`;
}

/** Polska odmiana: 1 rok, 2-4 lata (bez 12-14), pozostale lat. */
export function yearsWord(count: number): string {
  if (count === 1) {
    return "rok";
  }
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  return lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14) ? "lata" : "lat";
}

/** Wiersz powiazania encji z opublikowanym artykulem (sitemap, lista profili). */
export interface EntityArticleDateRow {
  entity_id: string;
  articles: { published_at: string | null } | null;
}

/**
 * Najnowsza data publikacji artykulu dla kazdej encji. Encja bez daty
 * (brak artykulu) nie trafia do wyniku - taki profil ma `noindex`.
 */
export function latestArticleByEntity(
  rows: readonly EntityArticleDateRow[],
): Map<string, string> {
  const latest = new Map<string, string>();
  for (const row of rows) {
    const publishedAt = row.articles?.published_at;
    if (!publishedAt) {
      continue;
    }
    const current = latest.get(row.entity_id);
    if (!current || Date.parse(publishedAt) > Date.parse(current)) {
      latest.set(row.entity_id, publishedAt);
    }
  }
  return latest;
}

/** Dzieli liste na paczki - filtr `in()` idzie w adresie URL zapytania. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
