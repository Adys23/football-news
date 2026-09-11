#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const url = process.argv[2];

if (!url) {
  console.error("Uzycie: node .cursor/skills/add-source/scripts/validate-feed.mjs <url>");
  process.exit(1);
}

const result = spawnSync("node", ["scripts/source-test.mjs", url], { stdio: "inherit" });
process.exit(result.status ?? 1);
