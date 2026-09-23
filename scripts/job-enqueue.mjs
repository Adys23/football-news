#!/usr/bin/env node
import { fail } from "./lib/run.mjs";
import { createLocalServiceClient } from "./lib/local-supabase.mjs";
import { enqueueJob } from "../supabase/functions/_shared/lib/jobs.ts";
import { jobTypeSchema } from "../supabase/functions/_shared/contracts/jobs.ts";

const typeArg = process.argv[2];
const payloadArg = process.argv[3] ?? "{}";

if (!typeArg) {
  fail("Uzycie: npm run job:enqueue -- <TYP> [json]");
}

const parsedType = jobTypeSchema.safeParse(typeArg);

if (!parsedType.success) {
  fail(`Nieznany typ joba: ${typeArg}`);
}

let payload;

try {
  payload = JSON.parse(payloadArg);
} catch {
  fail("Payload musi byc poprawnym JSON-em.");
}

const client = createLocalServiceClient();
const jobId = await enqueueJob(client, { type: parsedType.data, payload });

if (jobId) {
  console.log(`Zakolejkowano ${parsedType.data}: ${jobId}`);
} else {
  console.log(`Zadanie ${parsedType.data} juz jest w kolejce (dedupe).`);
}
