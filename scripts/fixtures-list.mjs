#!/usr/bin/env node
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";

const roots = [
  "tests",
  "supabase/functions/_shared/llm/fixtures",
  "supabase/functions/_shared/prompts",
];

function listFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full));
    } else {
      files.push(full.split(path.sep).join("/"));
    }
  }

  return files;
}

console.log("Dostepne pliki testowe i fixtures:\n");

for (const root of roots) {
  const files = listFiles(root);
  console.log(`${root}/ (${files.length})`);
  for (const file of files) {
    console.log(`  ${file}`);
  }
  console.log("");
}
