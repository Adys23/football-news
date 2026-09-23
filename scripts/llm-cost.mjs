#!/usr/bin/env node
import { createLocalServiceClient } from "./lib/local-supabase.mjs";
import { fail } from "./lib/run.mjs";

const days = Number(process.argv[2] ?? "7");

if (!Number.isInteger(days) || days < 1) {
  fail("Uzycie: npm run llm:cost -- [dni]");
}

const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
const client = createLocalServiceClient();

const { data, error } = await client
  .from("llm_calls")
  .select("stage, model, tokens_in, tokens_out, cost_usd, ok")
  .gte("created_at", since);

if (error) {
  fail(error.message);
}

const rows = data ?? [];
const byStage = new Map();
let total = 0;

for (const row of rows) {
  const key = `${row.stage}/${row.model}`;
  const current = byStage.get(key) ?? { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0, failed: 0 };
  current.calls += 1;
  current.tokensIn += row.tokens_in ?? 0;
  current.tokensOut += row.tokens_out ?? 0;
  current.cost += Number(row.cost_usd ?? 0);
  current.failed += row.ok ? 0 : 1;
  total += Number(row.cost_usd ?? 0);
  byStage.set(key, current);
}

console.log(`llm_calls z ostatnich ${days} dni: ${rows.length}`);
console.log(`koszt laczny: ${total.toFixed(4)} USD`);

for (const [key, stats] of [...byStage.entries()].sort()) {
  console.log(
    `  ${key}: ${stats.calls} wywolan, ${stats.tokensIn}/${stats.tokensOut} tokenow, ${stats.cost.toFixed(4)} USD, bledy ${stats.failed}`,
  );
}
