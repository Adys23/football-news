import type { ReactNode } from "react";
import { FeedLink } from "@/components/public/FeedLink";
import { SiteShell } from "@/components/public/SiteShell";

/**
 * Layout strony publicznej. Panel (/admin), logowanie i /brak-dostepu leza poza
 * grupa (site), wiec nie dostaja publicznej nawigacji. Layout nie wymusza renderu
 * na zadanie, zeby artykul zostal ISR; zadna trasa tej grupy nie jest prerenderowana
 * w buildzie (artykul i kategoria powstaja przy pierwszej wizycie).
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <FeedLink />
      <SiteShell>{children}</SiteShell>
    </>
  );
}
