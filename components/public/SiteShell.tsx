import type { ReactNode } from "react";
import { SiteFooter } from "@/components/public/SiteFooter";
import { SiteHeader } from "@/components/public/SiteHeader";
import { getNavigationCategories } from "@/lib/public/listings";

/** Naglowek, tresc i stopka serwisu. Nawigacja z bazy przez cache danych (tag articles). */
export async function SiteShell({ children }: { children: ReactNode }) {
  const categories = await getNavigationCategories();

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader categories={categories} />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter categories={categories} />
    </div>
  );
}
