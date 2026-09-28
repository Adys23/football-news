import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAccess, type AuthProfile } from "@/lib/auth/roles";
import { FORBIDDEN_PATH, LOGIN_PATH } from "@/lib/auth/redirects";

/**
 * Profil zalogowanego uzytkownika, raz na render. getUser pyta serwer Auth,
 * wiec sesja jest zweryfikowana, a nie tylko odczytana z ciasteczka.
 */
export const getCurrentProfile = cache(async (): Promise<AuthProfile | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Nie udalo sie odczytac profilu: ${error.message}`);
  }

  return data;
});

/**
 * Autorytatywna kontrola dostepu. Wolaja ja wszystkie strony panelu i kazda
 * server action; proxy tylko optymistycznie przekierowuje bez sesji.
 */
export async function requireRole(min: "editor" | "admin"): Promise<AuthProfile> {
  const profile = await getCurrentProfile();
  const access = resolveAccess(profile, min);

  if (!profile || access === "login") {
    redirect(LOGIN_PATH);
  }
  if (access === "forbidden") {
    redirect(FORBIDDEN_PATH);
  }

  return profile;
}
