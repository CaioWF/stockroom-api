#!/usr/bin/env node
// PostToolUse(Write|Edit) advisory: scan the prose just written for AI-slop tells
// and report them back to the agent so it rewrites. WARN-ONLY by design — a
// PostToolUse hook cannot block (the write already happened), and slop detection
// is heuristic, so exit 2 (stderr goes to the agent) is the whole enforcement.
//
// Scope: markdown prose (fenced code stripped) and comments in code files.
// Deliberately NOT a rule: em-dash. Through 2024 a wall of em-dashes flagged AI
// writing; current models suppress them, so presence or absence proves nothing —
// it is the biggest false-positive source and would drown the structural signals.
//
// Editable policy below. Env: KEEL_SLOP_OFF=1 disables; KEEL_SLOP_THRESHOLD sets
// how many DISTINCT tells one write may carry before the agent hears about it
// (default 3 — one stray phrase is not slop, a pile of them is).
import { readEvent } from "./_lib.mjs";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

const THRESHOLD = Math.max(1, Number(process.env.KEEL_SLOP_THRESHOLD) || 3);

// Comment syntax per extension. Prose lives in comments; code itself is not scanned.
const LINE_COMMENT = {
  ".js": "//", ".mjs": "//", ".cjs": "//", ".ts": "//", ".tsx": "//", ".jsx": "//",
  ".go": "//", ".rs": "//", ".java": "//", ".kt": "//", ".swift": "//", ".c": "//",
  ".h": "//", ".cc": "//", ".cpp": "//", ".hpp": "//", ".cs": "//", ".php": "//", ".scala": "//",
  ".py": "#", ".rb": "#", ".sh": "#", ".bash": "#", ".zsh": "#", ".yml": "#", ".yaml": "#",
  ".toml": "#", ".pl": "#", ".r": "#", ".ex": "#", ".exs": "#",
  ".sql": "--", ".lua": "--", ".hs": "--",
};
const BLOCK_COMMENT = [
  { ext: /\.(js|mjs|cjs|ts|tsx|jsx|go|rs|java|kt|swift|c|h|cc|cpp|hpp|cs|php|scala|css|scss)$/, open: "/*", close: "*/" },
  { ext: /\.(py)$/, open: '"""', close: '"""' },
  { ext: /\.(html|htm|xml|vue|svelte)$/, open: "<!--", close: "-->" },
];
const MD = /\.(md|mdx|markdown)$/i;

// Markdown: drop fenced blocks and inline code, keep prose (blockquotes included —
// instruction blocks in templates are prose someone wrote, and fair game).
// Everything skipped becomes an empty line instead of disappearing, so a reported
// line number matches the file the human opens.
function markdownProse(text) {
  const out = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; out.push(""); continue; }
    out.push(fenced ? "" : line.replace(/`[^`\n]*`/g, " "));
  }
  return out.join("\n");
}

// Code files: keep comment text only, one output line per input line.
function commentProse(text, ext) {
  const marker = LINE_COMMENT[ext];
  const block = BLOCK_COMMENT.find((b) => b.ext.test(ext));
  const out = [];
  let inBlock = false;
  for (const raw of text.split("\n")) {
    let line = raw;
    let keep = "";
    if (inBlock) {
      const end = block ? line.indexOf(block.close) : -1;
      if (end === -1) { out.push(line); continue; }
      keep = line.slice(0, end);
      inBlock = false;
      line = line.slice(end + block.close.length);
    }
    if (block) {
      const start = line.indexOf(block.open);
      if (start !== -1) {
        const rest = line.slice(start + block.open.length);
        const end = rest.indexOf(block.close);
        if (end === -1) { inBlock = true; out.push(keep + " " + rest); continue; }
        keep += " " + rest.slice(0, end);
        line = rest.slice(end + block.close.length);
      }
    }
    if (marker && !/^\s*#!/.test(raw)) {
      const i = line.indexOf(marker);
      if (i !== -1) keep += " " + line.slice(i + marker.length);
    }
    out.push(keep);
  }
  return out.join("\n");
}

// --- the tells. Structural ones first: harder to game than vocabulary. ---
const RULES = [
  { id: "not-just-x-but-y", re: /\bnot (?:just|only|merely|simply)\b[^.!?\n]{1,80}?\b(?:but|but also)\b/gi },
  { id: "its-not-x-its-y", re: /\bit(?:'|’)?s not\b[^.!?\n]{1,60}?,?\s+it(?:'|’)?s\b/gi },
  { id: "throat-clearing", re: /\b(?:here(?:'|’)?s the thing|let me be clear|make no mistake|the (?:uncomfortable|hard|simple|real) truth is|what(?:'|’)?s really happening here|it turns out that)\b/gi },
  { id: "undue-significance", re: /\b(?:stands as a testament|a testament to|marks? a (?:turning point|pivotal|shift)|pivotal (?:moment|role)|plays? a (?:crucial|vital) role|underscores? the (?:importance|significance)|highlights? the (?:importance|significance))\b/gi },
  { id: "participle-chain", re: /,\s+(?:highlighting|showcasing|emphasizing|underscoring|fostering|ensuring|reflecting|cultivating|contributing to|paving the way)\b/gi },
  { id: "hedge-boilerplate", re: /\b(?:it(?:'|’)?s worth noting|it is worth noting|it(?:'|’)?s important to note|it should be noted|in today(?:'|’)?s [\w-]+ world)\b/gi },
  { id: "formulaic-conclusion", re: /\b(?:despite (?:its|these) [^.\n]{0,40}(?:challenges|limitations)|future (?:prospects|outlook) (?:remain|look)|only time will tell|remains to be seen)\b/gi },
  { id: "vague-attribution", re: /\b(?:experts (?:say|argue|agree|believe)|industry reports|observers have (?:cited|noted)|studies show that|many believe that|it is widely (?:believed|regarded))\b/gi },
  { id: "sycophancy", re: /(?:^|\n)\s*(?:great|excellent|good) question\b|\byou(?:'|’)?re absolutely right\b|\bi(?:'|’)?d be happy to\b|(?:^|\n)\s*(?:certainly|absolutely)[!,]/gi },
  { id: "promotional", re: /\b(?:groundbreaking|revolutionary|cutting-edge|game-?chang(?:er|ing)|best-in-class|unlock the (?:power|potential)|harness the power|take it to the next level)\b/gi },
  // Vocabulary: counted by DISTINCT word, so one repeated word cannot reach the threshold alone.
  { id: "ai-vocabulary", re: /\b(?:delve|delving|tapestry|myriad|plethora|intricate|vibrant|showcase[sd]?|garner(?:ed|ing)?|boasts|holistic|seamlessly|ever-evolving|multifaceted|realm of)\b/gi, distinct: true },
  // Decorative emoji only: ⚠ ℹ ✔ ✖ and friends are signposts, not ornament.
  {
    id: "emoji-heading",
    re: /^#{1,6} .*$/gm,
    mdOnly: true,
    keep: (s) => /\p{Extended_Pictographic}/u.test(s.replace(/[⚠ℹ✔✖✗❌✅⛔️]/gu, "")),
  },
  // Section headings only (H2+). A Title-Cased document title (H1) is ordinary.
  { id: "title-case-heading", re: /^#{2,6} (?:[A-Z][a-z']+ ){3,}[A-Z][a-z']+\s*$/gm, mdOnly: true },
  // Rule of three is only a tell in bulk: a single triple is an ordinary list.
  { id: "rule-of-three", re: /\b\w+, \w+,? and \w+\b/gi, minCount: 3 },
];

const ev = await readEvent();
if (process.env.KEEL_SLOP_OFF === "1") process.exit(0);

const tool = ev.tool_name || "";
const ti = ev.tool_input || {};
const file = String(ti.file_path || "");
if (!file || (tool !== "Write" && tool !== "Edit")) process.exit(0);

const payload = tool === "Write" ? String(ti.content ?? "") : String(ti.new_string ?? "");
if (!payload.trim()) process.exit(0);

const ext = extname(file).toLowerCase();
const isMd = MD.test(file);
let prose;
if (isMd) prose = markdownProse(payload);
else if (LINE_COMMENT[ext] || BLOCK_COMMENT.some((b) => b.ext.test(ext))) prose = commentProse(payload, ext);
else process.exit(0);
if (!prose.trim()) process.exit(0);

// An Edit knows its text but not where it landed; recover the offset so reported
// line numbers point at the real file.
let base = 0;
if (tool === "Edit" && existsSync(file)) {
  try {
    const whole = readFileSync(file, "utf8");
    const at = whole.indexOf(payload);
    if (at > 0) base = whole.slice(0, at).split("\n").length - 1;
  } catch {}
}
const lineAt = (idx) => base + prose.slice(0, idx).split("\n").length;

const hits = [];
for (const rule of RULES) {
  if (rule.mdOnly && !isMd) continue;
  let found = [...prose.matchAll(rule.re)];
  if (rule.keep) found = found.filter((m) => rule.keep(m[0]));
  if (!found.length) continue;
  if (rule.minCount && found.length < rule.minCount) continue;
  const distinct = new Set(found.map((m) => m[0].toLowerCase().trim())).size;
  if (rule.distinct && distinct < 2) continue;
  hits.push({
    id: rule.id,
    line: lineAt(found[0].index),
    sample: found[0][0].replace(/\s+/g, " ").trim().slice(0, 60),
    count: rule.distinct ? distinct : found.length,
  });
}

if (hits.length < THRESHOLD) process.exit(0);

const lines = hits
  .sort((a, b) => a.line - b.line)
  .map((h) => `  ${file}:${h.line}  ${h.id}${h.count > 1 ? ` (x${h.count})` : ""}  "${h.sample}"`);
process.stderr.write(
  `[keel:slop-guard] ${hits.length} AI-writing tells in what you just wrote:\n${lines.join("\n")}\n` +
    `Rewrite the affected prose: say it plainly, cut the throat-clearing and the significance-claiming, ` +
    `drop the borrowed vocabulary. Advisory only — the file is already written, nothing is blocked. ` +
    `If a flagged phrase is genuinely the right words, keep it and move on (tune ` +
    `.claude/hooks/slop-guard.mjs, KEEL_SLOP_THRESHOLD, or KEEL_SLOP_OFF=1 to silence).\n`,
);
process.exit(2);
