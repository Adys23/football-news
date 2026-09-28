/** Kategoria dla artykulu bez przypisanej kategorii. */
export const DEFAULT_CATEGORY_SLUG = "pilka-nozna";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 120;

/** Odrzuca parametry, ktore nie moga byc slugiem, zanim trafia do bazy. */
export function isValidSlug(value: string): boolean {
  return value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);
}

/** Sciezka kanoniczna artykulu: /<kategoria>/<slug> (docs/architecture.md §4). */
export function articlePath(article: { slug: string; categorySlug: string | null }): string {
  return `/${article.categorySlug ?? DEFAULT_CATEGORY_SLUG}/${article.slug}`;
}
