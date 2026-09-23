#!/usr/bin/env node
import { fail } from "./lib/run.mjs";
import { createLocalServiceClient } from "./lib/local-supabase.mjs";
import { requeueDeadJobs } from "../supabase/functions/_shared/lib/jobs.ts";

const jobId = process.argv[2];
const client = createLocalServiceClient();

if (jobId) {
  const { data, error } = await client
    .from("jobs")
    .update({
      status: "queued",
      attempts: 0,
      error: null,
      next_run_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    })
    .eq("id", jobId)
    .in("status", ["dead", "failed"])
    .select("id, type");

  if (error) {
    fail(error.message);
  }

  if (!data || data.length === 0) {
    fail(`Nie znaleziono martwego ani nieudanego joba ${jobId}.`);
  }

  console.log(`Przywrocono ${data[0].type}: ${data[0].id}`);
  process.exit(0);
}

const count = await requeueDeadJobs(client);
console.log(`Przywrocono ${count} martwych zadan.`);
