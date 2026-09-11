#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync("node", ["scripts/jobs-status.mjs"], { stdio: "inherit" });
process.exit(result.status ?? 1);
