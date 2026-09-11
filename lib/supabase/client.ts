import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@contracts/index.ts";
import { requireEnv } from "@/lib/env";

/**
 * Klient dla komponentow klienckich. Uzywa klucza publicznego i sesji uzytkownika.
 * Nie wolno tu przekazywac klucza service_role ani wywolywac LLM.
 *
 * Odwolania do process.env sa statyczne, bo tylko takie Next wstawia do bundla.
 */
export function createSupabaseBrowserClient() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = requireEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return createBrowserClient<Database>(url, anonKey);
}
