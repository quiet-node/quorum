#!/usr/bin/env node
// Collects this repo's own source files and seeds them into the PROD Convex
// `repoFiles` table so the agent's coding-mode tools can read real source.
//
// Usage: node scripts/seed-repo.mjs
// Requires network access to the prod Convex deployment (run with
// dangerouslyDisableSandbox on the Bash call).

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MAX_BYTES = 40 * 1024;
const BATCH_SIZE = 10;

const SCAN_DIRS = ["app", "convex"];
const EXCLUDE_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  ".git",
  "_generated",
  ".vercel",
]);
const ROOT_FILES = ["README.md", "AGENTS.md", "CLAUDE.md", "package.json", "tsconfig.json"];

function isEnvPath(relPath) {
  const base = relPath.split("/").pop();
  return base.startsWith(".env");
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (stat.isFile()) {
      out.push(full);
    }
  }
}

const TEXT_EXTS = new Set([".ts", ".tsx", ".mjs", ".js", ".css", ".md", ".json"]);

const files = [];
for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  const collected = [];
  walk(abs, collected);
  for (const f of collected) {
    if (TEXT_EXTS.has(extname(f))) files.push(f);
  }
}
for (const rel of ROOT_FILES) {
  files.push(join(ROOT, rel));
}

const seeded = [];
for (const abs of files) {
  const relPath = relative(ROOT, abs).split("\\").join("/");
  if (isEnvPath(relPath)) {
    throw new Error(`refusing to seed env-like path: ${relPath}`);
  }
  const stat = statSync(abs);
  if (stat.size > MAX_BYTES) {
    console.log(`skip (>${MAX_BYTES}B): ${relPath}`);
    continue;
  }
  const content = readFileSync(abs, "utf8");
  seeded.push({ path: relPath, content });
}

// Safety assertion required by spec: no .env* paths in the snapshot.
for (const f of seeded) {
  if (isEnvPath(f.path)) {
    throw new Error(`env file leaked into snapshot: ${f.path}`);
  }
}

console.log(`collected ${seeded.length} files, seeding in batches of ${BATCH_SIZE}...`);

const convexBin = join(ROOT, "node_modules", ".bin", "convex");

for (let i = 0; i < seeded.length; i += BATCH_SIZE) {
  const batch = seeded.slice(i, i + BATCH_SIZE);
  const args = JSON.stringify({ files: batch });
  const result = spawnSync(
    convexBin,
    ["run", "repoFiles:seedBatch", args, "--prod"],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error(`convex run failed on batch starting at index ${i}`);
  }
  console.log(`seeded batch ${i / BATCH_SIZE + 1} (${batch.length} files)`);
}

console.log("done:");
for (const f of seeded) console.log(` - ${f.path}`);
