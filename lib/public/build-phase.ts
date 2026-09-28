import { PHASE_PRODUCTION_BUILD } from "next/constants";

/**
 * Czy kod dziala w `next build`. Strona glowna i layout serwisu sa prerenderowane
 * w buildzie, a build nie moze wymagac dostepu do bazy (CI buduje bez niej).
 */
export function isProductionBuild(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
}

/**
 * Czy blad supabase-js oznacza, ze baza jest nieosiagalna. Blad sieci nie ma kodu,
 * a jego komunikat pochodzi z fetch; bledy zapytania (zla kolumna, RLS) maja kod
 * PostgREST lub Postgresa i nie moga byc maskowane nawet w buildzie.
 */
export function isUnreachableDatabaseError(error: { code?: string; message: string }): boolean {
  return !error.code && error.message.startsWith("TypeError: fetch failed");
}
