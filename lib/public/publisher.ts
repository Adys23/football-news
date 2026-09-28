/**
 * Dane wydawcy na stronie /o-nas. Wartosci w nawiasach kwadratowych to
 * placeholdery: prawdziwe dane firmy uzupelnia wlasciciel serwisu przed startem.
 */
export const PUBLISHER_PLACEHOLDER_PREFIX = "[DO UZUPEŁNIENIA";

export const PUBLISHER = {
  legalName: "[DO UZUPEŁNIENIA: pełna nazwa wydawcy]",
  address: "[DO UZUPEŁNIENIA: adres siedziby]",
  registry: "[DO UZUPEŁNIENIA: KRS / NIP / REGON]",
  editorInChief: "[DO UZUPEŁNIENIA: redaktor naczelny]",
  contactEmail: "[DO UZUPEŁNIENIA: adres e-mail redakcji]",
  correctionsEmail: "[DO UZUPEŁNIENIA: adres e-mail do zgłaszania korekt]",
} as const;

/** Czy wartosc jest jeszcze placeholderem (nie linkujemy jej jako mailto:). */
export function isPublisherPlaceholder(value: string): boolean {
  return value.startsWith(PUBLISHER_PLACEHOLDER_PREFIX);
}
