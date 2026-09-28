import type { ReactNode } from "react";
import { connection } from "next/server";
import { FeedLink } from "@/components/public/FeedLink";
import { SiteShell } from "@/components/public/SiteShell";

/**
 * Strona glowna i strony stale (/o-nas) maja osobna grupe: statyczne trasy bylyby
 * prerenderowane w buildzie razem z nawigacja z bazy, a build nie ma bazy. connection()
 * przed zapytaniem o nawigacje przenosi render na zadanie tylko tutaj, bez wplywu na ISR
 * artykulow w grupie (site).
 */
export default async function HomeLayout({ children }: { children: ReactNode }) {
  await connection();
  return (
    <>
      <FeedLink />
      <SiteShell>{children}</SiteShell>
    </>
  );
}
