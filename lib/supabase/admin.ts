import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@contracts/index.ts";
import { requireEnv, supabaseUrl } from "@/lib/env";

/**
 * Klient z kluczem service_role, omijajacy RLS.
 *
 * Uzywamy go wylacznie do akcji redakcyjnych w panelu, ktorych nie da sie wykonac
 * na sesji uzytkownika (np. zapis rewizji artykulu w imieniu systemu).
 * Import "server-only" sprawia, ze proba uzycia po stronie klienta konczy sie
 * bledem budowania, a nie wyciekiem klucza.
 *
 * Cala praca pipeline'u dzieje sie w Edge Functions, nie tutaj.
 */
export function createSupabaseAdminClient() {
  const serviceRoleKey = requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  return createClient<Database>(supabaseUrl(), serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
