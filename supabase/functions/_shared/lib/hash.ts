/**
 * Normalizacja tytulow i hash materialu zrodlowego.
 *
 * To pierwsza i najtansza bariera duplikatow: ten sam material pobrany dwa razy
 * ma ten sam hash i nie wchodzi do systemu (unique index na source_items.hash).
 *
 * Odpowiednik SQL: funkcja normalize_title w migracji 0003. Obie implementacje
 * musza dawac ten sam wynik, dlatego zmiane trzeba wprowadzac w obu miejscach.
 */

/** Polskie znaki, ktorych NFD nie rozklada na znak bazowy i diakryt. */
const SPECIAL_CHARS: Record<string, string> = {
  ł: "l",
  Ł: "l",
  ø: "o",
  Ø: "o",
  đ: "d",
  Đ: "d",
  ß: "ss",
};

/** Tytul malymi literami, bez znakow diakrytycznych i interpunkcji. */
export function normalizeTitle(title: string): string {
  const withoutSpecials = [...title]
    .map((char) => SPECIAL_CHARS[char] ?? char)
    .join("")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return withoutSpecials
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Wejscie do hasha. Rozdzielone znakiem nowej linii, zeby uniknac kolizji przez zlepienie. */
export function buildHashInput(url: string, titleNormalized: string): string {
  return `${url}\n${titleNormalized}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Hash materialu zrodlowego: sha256 z adresu i znormalizowanego tytulu. */
export async function buildSourceItemHash(url: string, title: string): Promise<string> {
  return sha256Hex(buildHashInput(url, normalizeTitle(title)));
}
