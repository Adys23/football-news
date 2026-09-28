import type { ReactNode } from "react";
import { connection } from "next/server";
import { SiteFooter } from "@/components/public/SiteFooter";
import { SiteHeader } from "@/components/public/SiteHeader";
import { getNavigationCategories } from "@/lib/public/listings";

/**
 * Layout strony publicznej. Panel (/admin), logowanie i /brak-dostepu leza poza
 * grupa (site), wiec nie dostaja publicznej nawigacji. Render na zadanie (build nie ma
 * bazy); zapytania ida do Data Cache z tagami, odswieza je webhook publikacji.
 */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  await connection();
  const categories = await getNavigationCategories();

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader categories={categories} />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter categories={categories} />
    </div>
  );
}
