import Link from "next/link";
import type { PublicCategory } from "@/lib/public/cards";
import { categoryPath } from "@/lib/public/paths";
import { SITE } from "@/lib/site";

/** Naglowek serwisu z nawigacja po kategoriach. */
export function SiteHeader({ categories }: { categories: readonly PublicCategory[] }) {
  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          {SITE.name}
        </Link>
        {categories.length > 0 ? (
          <nav aria-label="Kategorie">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-neutral-700">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link href={categoryPath(category.slug)} className="hover:underline">
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
