import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@contracts/index.ts";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Odswieza sesje Supabase w proxy i zwraca odpowiedz z nowymi ciasteczkami.
 * Server Components nie moga zapisywac ciasteczek, wiec bez tego kroku
 * wygasly token nigdy nie zostalby wymieniony.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // getClaims weryfikuje podpis JWT; samo getSession ufaloby ciasteczku bez sprawdzenia.
  const { data } = await supabase.auth.getClaims();

  return { response, hasSession: Boolean(data?.claims) };
}
