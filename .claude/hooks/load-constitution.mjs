#!/usr/bin/env node
// SessionStart hook: inject base SDD context — the project product brief (product layer),
// the constitution (engineering layer, durable rules), and docs/STATE.md (volatile work
// memory: where we stopped, next step, blockers).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readEvent } from "./_lib.mjs";

const ev = await readEvent();
const cwd = ev.cwd || process.cwd();

// Prefer the filled .md (writer skill); fall back to the freshly-installed .md.tmpl so that
// hand-editing the template also shows up in context from the start.
const preferFilled = (base) => {
  const md = join(cwd, ".specify", "memory", `${base}.md`);
  return existsSync(md) ? md : join(cwd, ".specify", "memory", `${base}.md.tmpl`);
};

const sources = [
  [preferFilled("product"), "Product brief (user / problem / north-star metric)"],
  [preferFilled("constitution"), "Project constitution"],
  [join(cwd, "docs", "STATE.md"), "STATE — working memory (where we stopped / next step)"],
];

const parts = [];
for (const [path, label] of sources) {
  if (existsSync(path)) parts.push(`===== ${label} =====\n${readFileSync(path, "utf8").trim()}`);
}
if (!parts.length) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: parts.join("\n\n"),
    },
  }),
);
