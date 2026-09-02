#!/usr/bin/env node
// dependency-rule — checks that imports only point the way the architecture allows.
//
// The mechanical half of the dependency rule the constitution states and
// core/claude/skills/architecture/references/clean-architecture.md explains. It checks ONE
// invariant: given a declared layer map, no file in an inner layer may import an outer one.
// That is the whole job. This is not a dependency analyser — for cycle detection, orphan
// hunting or a full graph, use dependency-cruiser (TS/JS), import-linter (Python) or ArchUnit
// (Java). Those must be installed; keel ships zero-dep, so this ships instead.
//
// Skips rather than fails when there is nothing to check: no config, no root, no matching
// files. A gate that fails on plumbing teaches people to ignore gates.
//
// Usage: node dependency-rule.mjs [dir]   (exit 0 = clean or skipped, 1 = violations)
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname, sep } from "node:path";

const DIR = resolve(process.argv[2] || process.cwd());
const CONFIG = join(DIR, ".specify", "architecture.json");

function skip(why) {
  console.log(`dependency-rule: skipped (${why})`);
  process.exit(0);
}

if (!existsSync(CONFIG)) skip("no .specify/architecture.json");

let cfg;
try {
  cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
} catch (e) {
  console.error(`dependency-rule: .specify/architecture.json is not valid JSON — ${e.message}`);
  process.exit(1);
}

const root = cfg.root || "src";
const exts = cfg.extensions?.length ? cfg.extensions : [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const layers = cfg.layers || {};
const ignore = cfg.ignore || [];
const ROOT_ABS = join(DIR, root);

if (!Object.keys(layers).length) skip("no layers declared");
if (!existsSync(ROOT_ABS)) skip(`no ${root}/ directory`);

// Glob subset: * (not across /), ** (any depth), ? — enough for the ignore patterns a
// project writes here, without taking on a matcher dependency.
function globToRe(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") { re += ".*"; i++; if (pattern[i + 1] === "/") i++; }
      else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}
const ignoreRes = ignore.map(globToRe);
const ignored = (rel) => ignoreRes.some((r) => r.test(rel.split(sep).join("/")));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

// Comments are blanked before matching so a commented-out import is not a violation, and
// line numbering is preserved so the report points at the real line.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
}

// The forms that carry a module specifier. A multi-line import puts `from "x"` on its
// closing line, which this still catches, reported at that line.
const SPEC_RE = /(?:\bfrom\s*|\bimport\s*|\brequire\s*)\(?\s*["']([^"']+)["']/g;

const layerOf = (relPath) => {
  const seg = relPath.split(sep)[0];
  return Object.prototype.hasOwnProperty.call(layers, seg) ? seg : null;
};

// A layer may be declared as a bare array (just the inward list) or as an object that also
// constrains external packages.
const ruleFor = (layer) => {
  const r = layers[layer];
  if (Array.isArray(r)) return { mayImport: r, mayImportExternal: "*" };
  return { mayImport: r?.mayImport || [], mayImportExternal: r?.mayImportExternal ?? "*" };
};

const files = walk(ROOT_ABS);
if (!files.length) skip(`no source files under ${root}/`);

const violations = [];

for (const file of files) {
  const relFromRoot = relative(ROOT_ABS, file);
  if (ignored(relFromRoot)) continue;
  const from = layerOf(relFromRoot);
  // Files outside every declared layer are unchecked on purpose: the composition root
  // (main/index) exists precisely to wire concrete infra into use cases, and forbidding
  // that would forbid the application from being assembled at all.
  if (!from) continue;

  const rule = ruleFor(from);
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");

  lines.forEach((line, i) => {
    SPEC_RE.lastIndex = 0;
    let m;
    while ((m = SPEC_RE.exec(line))) {
      const spec = m[1];
      const where = `${relative(DIR, file)}:${i + 1}`;

      if (spec.startsWith(".")) {
        const targetRel = relative(ROOT_ABS, resolve(dirname(file), spec));
        if (targetRel.startsWith("..")) continue; // outside the root; not ours to judge
        const to = layerOf(targetRel);
        if (!to || to === from) continue;
        if (!rule.mayImport.includes(to)) {
          violations.push(
            `${where}: ${from}/ imports ${to}/ ("${spec}") — ${from} may import: ${rule.mayImport.join(", ") || "nothing"}`
          );
        }
      } else {
        const allow = rule.mayImportExternal;
        if (allow === "*") continue;
        if (spec.startsWith("node:")) continue; // stdlib is not a framework dependency
        const list = Array.isArray(allow) ? allow : [];
        // Allow-list, not deny-list: a package that enters the ecosystem later is blocked by
        // default instead of passing silently because nobody remembered to forbid it.
        const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        if (!list.includes(pkg)) {
          violations.push(
            `${where}: ${from}/ imports external "${pkg}" — ${from} may import external: ${list.join(", ") || "nothing"}`
          );
        }
      }
    }
  });
}

if (violations.length) {
  console.error(`✗ dependency-rule: ${violations.length} violation(s)`);
  for (const v of violations) console.error(`  ${v}`);
  console.error("  Dependencies point inward. Invert with a port the inner layer declares,");
  console.error("  or fix .specify/architecture.json if the layer map is wrong.");
  process.exit(1);
}

console.log(`✓ dependency-rule: ${files.length} file(s) across ${Object.keys(layers).length} layer(s), no violations`);
