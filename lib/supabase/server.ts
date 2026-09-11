import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@contracts/index.ts";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Klient dla kodu serwerowego Next.js. Dziala na sesji uzytkownika i respektuje RLS,
 * dlatego to on obsluguje strone publiczna oraz panel redaktora.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component nie moze zapisywac ciasteczek.
          // Odswiezaniem sesji zajmuje sie middleware.
        }
      },
    },
  });
}
