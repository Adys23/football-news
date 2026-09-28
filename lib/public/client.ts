import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@contracts/index.ts";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { PUBLIC_REVALIDATE_SECONDS } from "@/lib/public/cache-tags";

/**
 * Klient strony publicznej: klucz anon, bez ciasteczek i bez sesji. Dzieki temu
 * wynik nie zalezy od tego, kto oglada strone (redaktor nie wpusci szkicu do cache),
 * a kazde zapytanie trafia do Data Cache Next.js pod podanymi tagami.
 * `revalidateSeconds` musi zgadzac sie z `revalidate` strony - Next.js bierze najnizsza wartosc.
 */
export function createPublicClient(
  tags: readonly string[],
  revalidateSeconds: number = PUBLIC_REVALIDATE_SECONDS,
) {
  return createClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          next: { revalidate: revalidateSeconds, tags: [...tags] },
        }),
    },
  });
}
