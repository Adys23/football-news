import type { ReactNode } from "react";
import { connection } from "next/server";
import { SiteShell } from "@/components/public/SiteShell";

/**
 * Strona glowna ma osobna grupe: statyczna trasa `/` bylaby prerenderowana w buildzie,
 * a build nie ma bazy. connection() przed zapytaniem o nawigacje przenosi render na
 * zadanie tylko tutaj, bez wplywu na ISR artykulow w grupie (site).
 */
export default async function HomeLayout({ children }: { children: ReactNode }) {
  await connection();
  return <SiteShell>{children}</SiteShell>;
}
