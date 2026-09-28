import type { ReactNode } from "react";
import { SiteFooter } from "@/components/public/SiteFooter";
import { SiteHeader } from "@/components/public/SiteHeader";
import { getNavigationCategories } from "@/lib/public/listings";

/**
 * Layout strony publicznej. Panel (/admin), logowanie i /brak-dostepu leza poza
 * grupa (site), wiec nie dostaja publicznej nawigacji.
 */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const categories = await getNavigationCategories();

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader categories={categories} />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter categories={categories} />
    </div>
  );
}
