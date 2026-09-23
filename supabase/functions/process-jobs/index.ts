import { processJobBatch } from "../_shared/lib/worker.ts";
import { assertServiceRole, createServiceClient } from "../_shared/lib/service-client.ts";

function readEnv(): { url: string; serviceRoleKey: string } {
  return {
    url: Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  };
}

Deno.serve(async (req) => {
  const env = readEnv();
  const unauthorized = assertServiceRole(req, env.serviceRoleKey);
  if (unauthorized) {
    return unauthorized;
  }

  const client = createServiceClient(env.url, env.serviceRoleKey);
  let processed = 0;

  for (let round = 0; round < 5; round += 1) {
    const count = await processJobBatch({ client, worker: "process-jobs" }, 10);
    processed += count;
    if (count === 0) {
      break;
    }
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
