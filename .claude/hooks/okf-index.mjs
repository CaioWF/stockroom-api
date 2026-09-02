#!/usr/bin/env node
// SessionStart hook: index project Open Knowledge Format docs and inject a compact
// map before the first turn — every .md with a `type:` frontmatter key becomes a
// concept (name, type, path, [[links]]). Zero tool calls to discover what's documented.
// Zero-dep: node: builtins only. Never throws.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { readEvent } from "./_lib.mjs";

const BUDGET = parseInt(process.env.KEEL_OKF_BUDGET || "60", 10) || 60; // how many concepts to show in FULL detail
const HARD_MAX = 2000; // pathological-runaway safety bound only
const ROOTS = ["docs", "specs", ".specify/memory"]; // where keel keeps structured md
const SKIP = new Set([".git", "node_modules", ".specify/state"]);

const ev = await readEvent();
const cwd = ev.cwd || process.cwd();

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP.has(e.name)) continue;
      yield* walk(join(dir, e.name));
    } else if (e.name.endsWith(".md") && !e.name.startsWith("_")) {
      yield join(dir, e.name);
    }
  }
}

// Minimal frontmatter parse: key:value lines inside the leading --- ... --- block.
function frontmatter(text) {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return null;
  const fm = {};
  for (const line of text.slice(3, end).split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.+?)\s*$/);
    if (m) fm[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return fm;
}

const concepts = [];
outer: for (const root of ROOTS) {
  const base = join(cwd, root);
  if (!existsSync(base)) continue;
  for (const path of walk(base)) {
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    const fm = frontmatter(text);
    if (!fm || !fm.type) continue;
    const wiki = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
    const md = [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)]
      .filter((m) => /\.md(?:[)#]|$)/.test(m[2]) && !/^(?:https?:|mailto:|#|\/)/.test(m[2]))
      .map((m) => m[1]);
    const links = [...new Set([...wiki, ...md])].slice(0, 5);
    concepts.push({
      name: fm.name || fm.title || relative(cwd, path).replace(/\.md$/, ""),
      type: fm.type,
      path: relative(cwd, path),
      description: fm.description || "",
      links: [...new Set(links)].slice(0, 5),
    });
    if (concepts.length >= HARD_MAX) break outer;
  }
}

if (!concepts.length) process.exit(0);

// Group by type for a compact, scannable map.
const byType = {};
for (const c of concepts) (byType[c.type] ??= []).push(c);

// Build header with note about partial disclosure if needed.
let header = `Open Knowledge Format index — ${concepts.length} concept(s)`;
if (concepts.length > BUDGET) {
  header += `, zero tool calls (showing ${BUDGET} in full; rest pointered below)`;
} else {
  header += `, zero tool calls`;
}
header += ":";

const lines = [header];
let shown = 0;

for (const [type, items] of Object.entries(byType)) {
  lines.push(`\n[${type}]`);

  // Emit detail lines for concepts within budget, track unshown.
  const unshown = [];
  for (const c of items) {
    if (shown >= BUDGET) {
      unshown.push(c);
    } else {
      const desc = c.description ? ` — ${c.description}` : "";
      const lk = c.links.length ? `  -> ${c.links.join(", ")}` : "";
      lines.push(`  ${c.name} (${c.path})${desc}${lk}`);
      shown++;
    }
  }

  // Emit overflow pointer if this group has unshown concepts.
  if (unshown.length > 0) {
    const dirs = new Set();
    for (const c of unshown) {
      const dir = c.path.substring(0, c.path.lastIndexOf("/"));
      dirs.add(dir);
    }
    const dirList = Array.from(dirs).sort().slice(0, 4).join(", ");
    const ellipsis = dirs.size > 4 ? "…" : "";
    lines.push(`  …and ${unshown.length} more [${type}] concept(s) — Read on demand under: ${dirList}${ellipsis}`);
  }
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: lines.join("\n"),
    },
  }),
);
