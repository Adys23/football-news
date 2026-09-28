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

/** Sciezka kanoniczna listy kategorii: /<kategoria> (docs/architecture.md §4). */
export function categoryPath(categorySlug: string): string {
  return `/${categorySlug}`;
}

/** Profil zawodnika: /zawodnicy/<slug> (docs/architecture.md §4). */
export function playerPath(playerSlug: string): string {
  return `/zawodnicy/${playerSlug}`;
}

/** Profil klubu: /kluby/<slug> (docs/architecture.md §4). */
export function clubPath(clubSlug: string): string {
  return `/kluby/${clubSlug}`;
}

/** Strona autora: /autorzy/<slug> (docs/architecture.md §4). */
export function authorPath(authorSlug: string): string {
  return `/autorzy/${authorSlug}`;
}

/** Encje z profilem publicznym. Ligi nie maja wlasnej trasy w MVP (docs/architecture.md §4). */
export type ProfileEntityType = "player" | "club";

/** Profil encji z `article_entities` - do linkowania wewnetrznego i sitemapy. */
export function entityPath(entityType: ProfileEntityType, entitySlug: string): string {
  return entityType === "player" ? playerPath(entitySlug) : clubPath(entitySlug);
}

/** Informacja o wydawcy i kontakt. */
export const ABOUT_PATH = "/o-nas";

/** Zasady redakcyjne (docs/architecture.md §4). */
export const EDITORIAL_POLICY_PATH = "/o-nas/zasady-redakcyjne";
