export const ADMIN_HOME = "/admin";
export const LOGIN_PATH = "/login";
export const FORBIDDEN_PATH = "/brak-dostepu";

export type RequiredRole = "editor" | "admin";

const REQUIRED_ROLES: readonly RequiredRole[] = ["editor", "admin"];

/** Strona braku uprawnien z rola, ktorej wymagala odrzucona strona panelu. */
export function forbiddenPath(required: RequiredRole): string {
  return `${FORBIDDEN_PATH}?rola=${required}`;
}

/**
 * Rola z parametru `rola`. Przyjmujemy tylko wartosci z zamknietej listy: parametr
 * przychodzi z adresu, wiec strona nigdy nie pokazuje go uzytkownikowi wprost.
 */
export function parseRequiredRole(value: unknown): RequiredRole | null {
  return REQUIRED_ROLES.find((role) => role === value) ?? null;
}

function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_HOME || pathname.startsWith(`${ADMIN_HOME}/`);
}

/**
 * Cel przekierowania po zalogowaniu. Przyjmujemy tylko sciezki panelu, zeby parametr
 * `next` nie mogl wyprowadzic uzytkownika na obca domene (open redirect).
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || next.startsWith("//") || next.includes("\\")) {
    return ADMIN_HOME;
  }

  return isAdminPath(next.split(/[?#]/, 1)[0] ?? "") ? next : ADMIN_HOME;
}

/**
 * Optymistyczna decyzja proxy na podstawie samej sesji z ciasteczka.
 * Role i aktywnosc konta sprawdza DAL (`lib/auth/dal.ts`), bo proxy nie odpytuje bazy.
 * Proxy nie przekierowuje z /login do panelu: poprawny JWT bez profilu albo z odwolana
 * sesja DAL odsyla na /login, wiec taka regula dalaby petle przekierowan.
 */
export function proxyRedirect(pathname: string, hasSession: boolean): string | null {
  if (isAdminPath(pathname) && !hasSession) {
    return `${LOGIN_PATH}?next=${encodeURIComponent(pathname)}`;
  }

  return null;
}
