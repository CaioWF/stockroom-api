#!/usr/bin/env node
// Structural validator for Mermaid blocks in .md files (zero-dep, node: builtins only).
// Does not render — catches the errors that most often break rendering and that the agent
// most often makes:
//   • empty block                                (fatal)
//   • missing/unknown diagram type                (fatal)
//   • unbalanced double quotes                     (fatal)
//   • unbalanced (), [] or {}                      (warning — asymmetric shapes `>...]` give false positives)
// Exits 1 on fatal error. Serves as a gate. Usage: node validate-mermaid.mjs [dir]   (default: ".")
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, extname, relative } from "node:path";

const ROOT = resolve(process.argv[2] || ".");
// Includes generated view dirs (non-Claude clients) — derived from the source, not the source.
const IGNORE_DIRS = new Set(["node_modules", ".git", ".specify", ".agents", ".cursor", ".gemini", ".windsurf"]);

const TYPES = new Set([
  "flowchart", "graph", "sequenceDiagram", "classDiagram", "classDiagram-v2",
  "stateDiagram", "stateDiagram-v2", "erDiagram", "journey", "gantt", "pie",
  "mindmap", "timeline", "gitGraph", "quadrantChart", "requirementDiagram",
  "C4Context", "C4Container", "C4Component", "C4Dynamic", "C4Deployment",
  "sankey-beta", "xychart-beta", "block-beta", "packet-beta", "architecture-beta",
  "kanban", "radar", "zenuml",
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (IGNORE_DIRS.has(name) || name.startsWith(".tmp")) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) out.push(...walk(full));
    else if (extname(full) === ".md") out.push(full);
  }
  return out;
}

function mermaidBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    if (cur === null) {
      if (/^\s*```\s*mermaid\s*$/i.test(lines[i])) cur = { start: i + 1, body: [] };
    } else if (/^\s*```\s*$/.test(lines[i])) {
      blocks.push(cur); cur = null;
    } else {
      cur.body.push(lines[i]);
    }
  }
  return blocks;
}

const stripComments = (body) =>
  body.map((l) => { const i = l.indexOf("%%"); return i === -1 ? l : l.slice(0, i); }).join("\n");

const errors = [];
const warns = [];

for (const f of walk(ROOT)) {
  const rel = relative(ROOT, f) || f;
  let blocks;
  try { blocks = mermaidBlocks(readFileSync(f, "utf8")); } catch { continue; }

  blocks.forEach((b, n) => {
    const where = `${rel} (mermaid block #${n + 1}, line ${b.start})`;

    let i = 0;
    while (i < b.body.length && b.body[i].trim() === "") i++;
    if (i < b.body.length && b.body[i].trim() === "---") {
      i++;
      while (i < b.body.length && b.body[i].trim() !== "---") i++;
      i++;
    }
    while (i < b.body.length && (b.body[i].trim() === "" || b.body[i].trim().startsWith("%%"))) i++;
    const first = i < b.body.length ? b.body[i].trim() : "";
    if (!first) { errors.push(`${where}: empty mermaid block`); return; }
    const kw = (first.match(/^([A-Za-z][\w-]*)/) || [])[1] || "";
    if (!TYPES.has(kw)) errors.push(`${where}: missing/unknown diagram type ("${first.slice(0, 30)}")`);

    const stripped = stripComments(b.body);
    const quotes = (stripped.match(/"/g) || []).length;
    if (quotes % 2 !== 0) errors.push(`${where}: unbalanced double quotes (${quotes})`);

    let outside = "", inQ = false;
    for (const ch of stripped) {
      if (ch === '"') inQ = !inQ;
      else if (!inQ) outside += ch;
    }
    for (const [op, cl, label] of [["(", ")", "()"], ["[", "]", "[]"], ["{", "}", "{}"]]) {
      const o = outside.split(op).length - 1;
      const c = outside.split(cl).length - 1;
      if (o !== c) warns.push(`${where}: ${label} possibly unbalanced (${o} open / ${c} closed)`);
    }
  });
}

if (warns.length) {
  console.log(`\n⚠ Mermaid warnings (${warns.length}) — check (asymmetric shapes \`>…]\` may be false positives):`);
  for (const w of warns) console.log(`  • ${w}`);
}
if (errors.length) {
  console.error(`\n✗ Mermaid validation: ${errors.length} error(s)\n`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ Mermaid validation: blocks OK (type, quotes, delimiters).`);
