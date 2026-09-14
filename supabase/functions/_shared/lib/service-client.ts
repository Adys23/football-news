import { createClient } from "@supabase/supabase-js";
import type { Database } from "../contracts/database.types.ts";
import type { ServiceClient } from "./jobs.ts";
import { JobError } from "./jobs.ts";

export function createServiceClient(url: string, serviceRoleKey: string): ServiceClient {
  if (!url || !serviceRoleKey) {
    throw new JobError("Brak SUPABASE_URL albo SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function assertServiceRole(req: Request, serviceRoleKey: string): Response | null {
  const auth = req.headers.get("Authorization") ?? "";
  if (!serviceRoleKey || auth !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  return null;
}
