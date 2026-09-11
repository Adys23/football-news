#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const id = process.argv[2];
const args = ["scripts/job-replay.mjs"];
if (id) {
  args.push(id);
}

const result = spawnSync("node", args, { stdio: "inherit" });
process.exit(result.status ?? 1);
