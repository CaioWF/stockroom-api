#!/usr/bin/env node
// Structural audit of SDD documentation (zero-dep, node: builtins only).
// Deterministic rules (serves as a gate; exit 1 on any violation):
//   • every skill (.claude/skills/ * /SKILL.md) has frontmatter with `name` and `description`
//   • every specs/NNNN-* folder has spec.md
//   • relative links in .md don't point to a nonexistent file
// Does NOT require frontmatter on every .md (CLAUDE.md, README, ADRs don't have it) — only on skills.
// Usage: node audit-structure.mjs [dir]   (default: ".")
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve, extname, basename } from "node:path";

const ROOT = resolve(process.argv[2] || ".");
// Generated view dirs (non-Claude clients) are artifacts derived from the canonical source
// (.claude/ + CLAUDE.md) — auditing the source is enough and avoids false positives.
const IGNORE = new Set(["node_modules", ".git", ".specify", ".agents", ".cursor", ".gemini", ".windsurf"]);
// Generated instruction files (outside their own dir) that are also derived views.
const isGenerated = (f) => {
  const r = relative(ROOT, f).replace(/\\/g, "/");
  return r === "AGENTS.md" || r === "GEMINI.md" ||
    r === ".github/copilot-instructions.md" || r.startsWith(".github/prompts/");
};
const errors = [];
const err = (f, m) => errors.push(`${relative(ROOT, f) || f}: ${m}`);

function walk(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    if (IGNORE.has(n) || n.startsWith(".tmp")) continue;
    const f = join(dir, n);
    let st;
    try { st = statSync(f); } catch { continue; }
    if (st.isDirectory()) out.push(...walk(f));
    else if (extname(f) === ".md") out.push(f);
  }
  return out;
}

function parseFrontmatter(text) {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const keys = {};
  for (const line of text.slice(3, end).split("\n")) {
    const m = line.match(/^([A-Za-z_][\w-]*)\s*:/);
    if (m) keys[m[1]] = line.slice(m[0].length).trim();
  }
  return keys;
}

// Only each skill's SKILL.md requires frontmatter; companion files (prompts,
// anti-patterns, refs) sit alongside it and are not skills. Matches both the installed
// layout (.claude/skills/) and keel's own source layout (core/claude/skills/, packs/*/skills/),
// so the gate audits the corpus it ships as well as the one it installs.
const slash = (f) => f.replace(/\\/g, "/");
const isSkill = (f) => slash(f).includes("/skills/") && basename(f) === "SKILL.md";
// A companion is any other .md living under a skill directory (same dir as SKILL.md, or a
// sub-dir of it such as references/).
const companionOf = (f) => {
  if (basename(f) === "SKILL.md" || !slash(f).includes("/skills/")) return null;
  for (let d = dirname(f), i = 0; i < 3; d = dirname(d), i++) {
    if (existsSync(join(d, "SKILL.md"))) return d;
  }
  return null;
};
const files = walk(ROOT).filter((f) => !isGenerated(f));

// Warnings are authoring guidance from the Agent Skills docs ("under 500 lines", "table of
// contents for reference files longer than 100 lines"). They are reported but never fail the
// gate — only the platform's own validation limits are hard errors, because a skill that
// breaks those will not load at all.
const warnings = [];
const warn = (f, m) => warnings.push(`${relative(ROOT, f) || f}: ${m}`);

// 1) skills need frontmatter name + description, within the platform's validation limits
for (const f of files) {
  if (!isSkill(f)) continue;
  const text = readFileSync(f, "utf8");
  const fm = parseFrontmatter(text);
  if (!fm) { err(f, "skill missing frontmatter"); continue; }
  if (!fm.name) err(f, "skill missing `name`");
  if (!fm.description) err(f, "skill missing `description`");
  if (fm.name && fm.name.length > 64) err(f, `skill \`name\` is ${fm.name.length} chars (max 64)`);
  if (fm.name && !/^[a-z0-9-]+$/.test(fm.name))
    err(f, `skill \`name\` must be lowercase letters, numbers and hyphens only (got \`${fm.name}\`)`);
  if (fm.description && fm.description.length > 1024)
    err(f, `skill \`description\` is ${fm.description.length} chars (max 1024)`);
  // Body = everything after the frontmatter block.
  const end = text.indexOf("\n---", 3);
  const body = end === -1 ? text : text.slice(end + 4);
  const lines = body.split("\n").length;
  if (lines > 500)
    warn(f, `SKILL.md body is ${lines} lines — guidance is to stay under 500 lines; split detail into references/`);
}

// 1b) long companions need a table of contents, so a partial read still shows the full scope.
// `*-prompt.md` files are copied verbatim into a dispatched brief, where a ToC would leak
// into the prompt itself — they are reference-shaped only by accident, so they are exempt.
for (const f of files) {
  if (!companionOf(f)) continue;
  if (/-prompt\.md$/.test(basename(f))) continue;
  const text = readFileSync(f, "utf8");
  const lines = text.split("\n");
  if (lines.length <= 100) continue;
  const hasToc = lines.slice(0, 40).some((l) => /^#{1,3}\s+(contents|table of contents)\s*$/i.test(l.trim()));
  if (!hasToc)
    warn(f, `companion is ${lines.length} lines with no table of contents — add a "## Contents" list at the top`);
}

// 2) every specs/NNNN-* needs spec.md
const specsDir = join(ROOT, "specs");
if (existsSync(specsDir)) {
  for (const n of readdirSync(specsDir)) {
    if (/^\d+-/.test(n) && !existsSync(join(specsDir, n, "spec.md")))
      err(join(specsDir, n), "feature missing `spec.md`");
  }
}

// 3) broken relative links
const linkRe = /\]\(([^)]+)\)/g;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  let m;
  while ((m = linkRe.exec(text))) {
    let target = m[1].trim();
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    if (/[<>]|XXXX|NNNN|NNN|\s/.test(target)) continue; // template placeholders
    target = target.split("#")[0];
    if (!target) continue;
    if (!existsSync(resolve(dirname(f), target))) err(f, `broken link → ${target}`);
  }
}

if (warnings.length) {
  console.log(`\n! Structural audit: ${warnings.length} authoring warning(s)\n`);
  for (const w of warnings) console.log(`  • ${w}`);
  console.log("");
}

if (errors.length) {
  console.error(`\n✗ Structural audit: ${errors.length} problem(s)\n`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error("");
  process.exit(1);
}
console.log(`✓ Structural audit: ${files.length} docs OK (skills, specs, links).`);
