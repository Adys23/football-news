/** Limit sluga z seoOutputSchema. */
export const MAX_SLUG_LENGTH = 90;

/**
 * Pierwszy wolny slug: `base`, potem `base-2`, `base-3`... Sufiks miesci sie
 * w limicie dlugosci kosztem konca bazy, a obciety koniec nie zostawia myslnika.
 */
export function uniqueSlug(base: string, taken: Set<string>): string {
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? "" : `-${n}`;
    const head = base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/, "");
    const candidate = `${head}${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}
