import { enqueueJob } from "../_shared/lib/jobs.ts";
import { isPipelineEnabled } from "../_shared/lib/handler-context.ts";
import { logInfo } from "../_shared/lib/log.ts";
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

  if (!(await isPipelineEnabled(client))) {
    return json({ ok: true, enqueued: 0, reason: "pipeline_disabled" });
  }

  const { data, error } = await client.rpc("list_due_sources");
  if (error) {
    return json({ error: error.message }, 500);
  }

  let enqueued = 0;

  for (const source of data ?? []) {
    const jobId = await enqueueJob(client, {
      type: "FETCH_SOURCE",
      payload: { sourceId: source.id },
      dedupeKey: `FETCH_SOURCE:${source.id}`,
      sourceId: source.id,
      priority: 40,
    });

    if (jobId) {
      enqueued += 1;
    }
  }

  logInfo("fetch-sources.dispatch", { due: data?.length ?? 0, enqueued });
  return json({ ok: true, due: data?.length ?? 0, enqueued });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
