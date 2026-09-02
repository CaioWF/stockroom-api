#!/usr/bin/env node
// Spec→implementation fidelity eval (zero-dep, node: builtins only).
// For every specs/NNNN-*/ that ALREADY HAS tasks.md: every AC-N declared in the spec must be
// covered by a task (AC-N token in tasks.md). AC with no task => broken traceability (exit 1).
// AC with no reference in code/test (AC-N token in code) => warning, doesn't block.
// contract.md coverage is reported both ways, warning-only: AC with no "## AC-N" section
// (verification never declared) and section for an AC the spec dropped/renumbered (stale contract).
// Features still in the spec phase (no tasks.md) are skipped — the gate only applies after tasks-writer.
// SPEC_DEVIATION in code is counted and reported (marker of a conscious deviation).
// Usage: node eval-spec-fidelity.mjs [dir]   (default: ".")
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, extname } from "node:path";

const ROOT = resolve(process.argv[2] || ".");
const SKIP = new Set(["node_modules", ".git", ".claude", ".specify", "specs", "docs", "scripts"]);
const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".go", ".java", ".rb", ".php", ".cs", ".rs", ".kt", ".swift", ".sql", ".feature"]);

function walkCode(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    if (SKIP.has(n) || n.startsWith(".tmp")) continue;
    const f = join(dir, n);
    let st;
    try { st = statSync(f); } catch { continue; }
    if (st.isDirectory()) out.push(...walkCode(f));
    else if (CODE_EXT.has(extname(f))) out.push(f);
  }
  return out;
}

const acTokens = (s) => new Set(s.match(/AC-\d+/g) || []);

const specsDir = join(ROOT, "specs");
if (!existsSync(specsDir)) { console.log("No specs/ — nothing to evaluate."); process.exit(0); }

let codeBlob = "";
try { for (const f of walkCode(ROOT)) codeBlob += "\n" + readFileSync(f, "utf8"); } catch {}
const codeACs = acTokens(codeBlob);
const deviations = (codeBlob.match(/SPEC_DEVIATION/g) || []).length;

let hardFail = 0;
const rows = [];
for (const name of readdirSync(specsDir)) {
  if (!/^\d+-/.test(name)) continue; // accepts NNN- (skills) and NNNN- (any number of digits)
  const dir = join(specsDir, name);
  if (!existsSync(join(dir, "spec.md"))) continue;
  const acs = [...acTokens(readFileSync(join(dir, "spec.md"), "utf8"))].sort();
  if (!acs.length) continue;
  if (!existsSync(join(dir, "tasks.md"))) { rows.push({ name, acs, pending: true }); continue; }
  const taskACs = acTokens(readFileSync(join(dir, "tasks.md"), "utf8"));
  const uncovered = acs.filter((ac) => !taskACs.has(ac));
  const noTest = acs.filter((ac) => !codeACs.has(ac));
  hardFail += uncovered.length;

  // Verification contract (warn-only): every AC should declare how it is proven.
  // A section heading "## AC-N" is what counts — a bare AC-N mention elsewhere is not a contract.
  const contractPath = join(dir, "contract.md");
  let contract = null;
  if (existsSync(contractPath)) {
    const txt = readFileSync(contractPath, "utf8");
    const declared = new Set((txt.match(/^##\s+(AC-\d+)/gm) || []).map((h) => h.match(/AC-\d+/)[0]));
    contract = {
      undeclared: acs.filter((ac) => !declared.has(ac)),
      // Reverse direction: a contract section for an AC the spec no longer has. This is how
      // renumbered/deleted criteria show up — the classic way a traceability doc goes stale.
      orphan: [...declared].filter((ac) => !acs.includes(ac)).sort(),
      verified: (txt.match(/^\s*-?\s*\*{0,2}status\*{0,2}:\s*PASS\b/gim) || []).length,
    };
  }
  rows.push({ name, acs, byTask: acs.length - uncovered.length, byTest: acs.length - noTest.length, uncovered, noTest, contract });
}

console.log("\nSpec→implementation fidelity eval\n");
for (const r of rows) {
  console.log(`  ${r.name}`);
  if (r.pending) { console.log(`    AC: ${r.acs.length} · no tasks.md yet (spec phase) — traceability not required`); continue; }
  console.log(`    AC: ${r.acs.length} · by task: ${r.byTask}/${r.acs.length} · in code/test: ${r.byTest}/${r.acs.length}`);
  if (r.uncovered.length) console.log(`    ✗ AC with no task (traceability): ${r.uncovered.join(", ")}`);
  if (r.noTest.length) console.log(`    ⚠ AC with no reference in code/test: ${r.noTest.join(", ")}`);
  if (!r.contract) console.log(`    ⚠ no contract.md — verification not declared (tasks-writer writes it)`);
  else {
    console.log(`    contract: ${r.acs.length - r.contract.undeclared.length}/${r.acs.length} AC declared · ${r.contract.verified} marked PASS`);
    if (r.contract.undeclared.length) console.log(`    ⚠ AC with no section in contract.md: ${r.contract.undeclared.join(", ")}`);
    if (r.contract.orphan.length) console.log(`    ⚠ contract.md section for an AC the spec no longer has (stale): ${r.contract.orphan.join(", ")}`);
  }
}
console.log(`\n  SPEC_DEVIATION open in code: ${deviations}`);

if (hardFail) {
  console.error(`\n✗ ${hardFail} AC with no task coverage — broken traceability.\n`);
  process.exit(1);
}
console.log(`\n✓ Spec→task traceability OK (test reference is a warning until implemented).\n`);
