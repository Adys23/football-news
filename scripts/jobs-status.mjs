#!/usr/bin/env node
import { createLocalServiceClient } from "./lib/local-supabase.mjs";
import { fail } from "./lib/run.mjs";

const client = createLocalServiceClient();

const { data, error } = await client
  .from("jobs")
  .select("id, type, status, error, attempts, next_run_at, created_at")
  .order("created_at", { ascending: false })
  .limit(100);

if (error) {
  fail(error.message);
}

const jobs = data ?? [];
const counts = {};

for (const job of jobs) {
  counts[job.status] = (counts[job.status] ?? 0) + 1;
}

console.log("Kolejka (ostatnie 100):");
console.log(
  Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `  ${status}: ${count}`)
    .join("\n") || "  (pusto)",
);

const dead = jobs.filter((job) => job.status === "dead");

if (dead.length > 0) {
  console.log("\nMartwe zadania:");
  for (const job of dead) {
    console.log(`  ${job.id}  ${job.type}  ${job.error ?? ""}`);
  }
}
