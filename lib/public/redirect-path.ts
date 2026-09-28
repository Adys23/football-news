import { articlePath } from "@/lib/public/paths";

export interface RedirectTargetRow {
  slug: string;
  status: string;
  categories: { slug: string } | null;
}

/**
 * Sciezka docelowa przekierowania ze starego sluga albo null. Filtr statusu dublujemy
 * po stronie zapytania i tutaj: polityka redaktora widzi tez nieopublikowane artykuly.
 * Wpis wskazujacy aktualny slug (nie powinien istniec, 0023 go usuwa) dalby petle.
 */
export function redirectPathFromRow(oldSlug: string, target: RedirectTargetRow): string | null {
  if (target.status !== "published" || target.slug === oldSlug) {
    return null;
  }

  return articlePath({ slug: target.slug, categorySlug: target.categories?.slug ?? null });
}
