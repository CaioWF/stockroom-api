#!/usr/bin/env node
// File-scope partitioning and verification for dispatch-parallel (zero-dep, node: builtins only).
//
// Two modes:
//
//   partition <tasks.md>
//     Reads the checklist lines from tasks.md, extracts the `[scope: glob, glob]` of each task and
//     groups them into CONSECUTIVE batches where the scopes are pairwise disjoint (no pair touches the
//     same file). A task with no scope, or with a broad glob (empty prefix, e.g. `**`, `**/*.ts`),
//     runs alone (batch of one). Prints the batches in order. Deterministic, informational
//     (exit 0), except malformed scope → exit 1.
//     Max batch size: env KEEL_PARALLEL_MAX (default 4).
//
//   check "<glob, glob>" <file>...
//     Verifies that EVERY changed file matches at least one glob of the declared scope. Any
//     file outside the scope → exit 1 (an out-of-scope write could collide with a sibling task).
//     All inside → exit 0.
//
// Disjointness is conservative (whitelist): when in doubt, treat as overlapping and serialize. Never
// declares disjoint something that could collide.
import { readFileSync } from "node:fs";

const MAX = Math.max(1, parseInt(process.env.KEEL_PARALLEL_MAX || "4", 10) || 4);
const WILDCARD = /[*?[\]{}]/;

// Literal segments of a glob: path prefix before the first segment with a wildcard.
// `src/auth/**` -> ["src","auth"] · `src/*.ts` -> ["src"] · `**/*.ts` -> [] (broad, matches everything).
function litSegs(glob) {
  const segs = [];
  for (const seg of glob.split("/")) {
    if (WILDCARD.test(seg)) break;
    segs.push(seg);
  }
  return segs;
}

const isSegPrefix = (a, b) => a.length <= b.length && a.every((s, i) => s === b[i]);

// Two globs overlap if one literal prefix is a seg-prefix of the other (or equal). An empty prefix
// (broad glob) is a seg-prefix of anything → overlaps everything.
function globsOverlap(gA, gB) {
  const a = litSegs(gA), b = litSegs(gB);
  return isSegPrefix(a, b) || isSegPrefix(b, a);
}

// Scope = list of globs. Two scopes overlap if some pair of globs overlaps.
function scopesOverlap(sA, sB) {
  for (const a of sA) for (const b of sB) if (globsOverlap(a, b)) return true;
  return false;
}

const isBroad = (scope) => scope.length === 0 || scope.some((g) => litSegs(g).length === 0);

function parseScope(raw) {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// glob -> anchored RegExp. `**/`->(?:.*/)?  `**`->.*  `*`->[^/]*  `?`->[^/]
function globToRe(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") { re += "(?:.*/)?"; i += 2; } else { re += ".*"; i += 1; }
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (".+^${}()|[]\\".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp("^" + re + "$");
}

const norm = (f) => f.replace(/^\.\//, "");
const fileInScope = (file, scope) => scope.some((g) => globToRe(g).test(norm(file)));

// --- tasks.md parsing ---
// Top-level checklist line: `- [ ] Task N: ... [scope: a, b]` (or `- [x] ...`).
function parseTasks(md) {
  const tasks = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^- \[[ xX]\]\s+(.*)$/);
    if (!m) continue;
    const text = m[1];
    const label = (text.match(/^(Task\s+\d+)/i) || [, text.slice(0, 40)])[1];
    const open = text.indexOf("[scope:");
    if (open !== -1 && text.indexOf("]", open) === -1) {
      throw new Error(`malformed scope (missing ']') in: ${line.trim()}`);
    }
    const sm = text.match(/\[scope:\s*([^\]]*)\]/i);
    tasks.push({ label, scope: sm ? parseScope(sm[1]) : [] });
  }
  return tasks;
}

function partition(tasksPath) {
  let md;
  try { md = readFileSync(tasksPath, "utf8"); }
  catch { console.error(`✗ could not read ${tasksPath}`); process.exit(1); }

  let tasks;
  try { tasks = parseTasks(md); }
  catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }

  if (!tasks.length) { console.log("No checklist tasks in tasks.md — nothing to partition."); process.exit(0); }

  const batches = [];
  let cur = null;
  for (const t of tasks) {
    if (isBroad(t.scope)) { cur = null; batches.push([t]); continue; } // solo
    if (cur && cur.length < MAX && cur.every((o) => !scopesOverlap(o.scope, t.scope))) cur.push(t);
    else { cur = [t]; batches.push(cur); }
  }

  console.log("\nTask partition for dispatch-parallel\n");
  let parallel = 0;
  batches.forEach((b, i) => {
    const tag = b.length > 1 ? `parallel ×${b.length}` : "solo";
    if (b.length > 1) parallel++;
    console.log(`  Batch ${i + 1} (${tag}): ${b.map((t) => t.label).join(", ")}`);
    for (const t of b) console.log(`      ${t.label}: ${t.scope.length ? t.scope.join(", ") : "(no scope)"}`);
  });
  console.log(`\n  ${batches.length} batch(es), ${parallel} parallelizable (max ${MAX}/batch).`);
  if (!parallel) console.log("  No batch >1 — no parallel gain; use sequential dispatch.");
  console.log("");
  process.exit(0);
}

function check(scopeRaw, files) {
  const scope = parseScope(scopeRaw);
  if (!scope.length) { console.error("✗ check requires a non-empty scope as the 1st argument"); process.exit(1); }
  const outside = files.map(norm).filter((f) => !fileInScope(f, scope));
  if (outside.length) {
    console.error(`\n✗ ${outside.length} file(s) outside the declared scope [${scope.join(", ")}]:`);
    for (const f of outside) console.error(`    ${f}`);
    console.error("");
    process.exit(1);
  }
  console.log(`✓ ${files.length} file(s) inside the scope [${scope.join(", ")}].`);
  process.exit(0);
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === "partition") partition(rest[0] || "tasks.md");
else if (mode === "check") check(rest[0] || "", rest.slice(1));
else {
  console.error("usage: validate-parallel-scope.mjs partition <tasks.md>");
  console.error("       validate-parallel-scope.mjs check \"<glob, glob>\" <file>...");
  process.exit(2);
}
