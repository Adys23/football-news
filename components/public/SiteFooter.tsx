import Link from "next/link";
import type { PublicCategory } from "@/lib/public/cards";
import { categoryPath } from "@/lib/public/paths";
import { SITE } from "@/lib/site";

/** Stopka serwisu. Linki do stron stalych (zasady redakcyjne, wydawca) dochodza w PR 4.5. */
export function SiteFooter({ categories }: { categories: readonly PublicCategory[] }) {
  return (
    <footer className="mt-16 border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-10 text-sm text-neutral-600 sm:grid-cols-2 sm:px-6">
        <div>
          <p className="font-semibold text-neutral-900">{SITE.name}</p>
          <p className="mt-2 leading-relaxed">{SITE.description}</p>
        </div>
        {categories.length > 0 ? (
          <nav aria-label="Kategorie w stopce">
            <p className="font-semibold text-neutral-900">Kategorie</p>
            <ul className="mt-2 space-y-1">
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
    </footer>
  );
}
