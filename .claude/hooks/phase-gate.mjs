#!/usr/bin/env node
// PreToolUse(Edit|Write) gate: default-deny edits to code until the active
// feature has an approved spec.md AND plan.md. SDD artifacts/docs are exempt.
//
// Proportionality: a one-word typo does not deserve six artifacts and two human
// approvals. The declared trivial-change path exists for that — write the reason
// into `.specify/trivial` (one line) and small edits are allowed while it stays
// fresh. It is a designed door, not a bypass: it announces the reason on every
// edit it permits, it expires, and it refuses anything that is not actually
// small. Real work still goes through the flow.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { readEvent, activeFeature } from "./_lib.mjs";

const TTL_MIN = Math.max(1, Number(process.env.KEEL_TRIVIAL_TTL_MIN) || 30);
const MAX_LINES = Math.max(1, Number(process.env.KEEL_TRIVIAL_MAX_LINES) || 10);

const ev = await readEvent();
const cwd = ev.cwd || process.cwd();
const ti = ev.tool_input || {};
const file = ti.file_path || "";

// Allow edits to SDD artifacts / docs / the constitution files themselves.
// Anchor the dir exemption to the TOP-LEVEL segment relative to cwd, so a
// coincidental nested dir (e.g. src/docs/, src/specs/) does NOT escape the
// gate. Files outside cwd fall through to default-deny.
const rel = file.startsWith(cwd + "/") ? file.slice(cwd.length + 1) : file;
const top = rel.split("/")[0];
const base = basename(file);
const exempt =
  top === "specs" ||
  top === ".specify" ||
  top === "docs" ||
  base === "CLAUDE.md" ||
  base === "AGENTS.md";
if (exempt) process.exit(0);

function isApproved(path) {
  if (!existsSync(path)) return false;
  const txt = readFileSync(path, "utf8");
  const m = txt.match(/^---\n([\s\S]*?)\n---/);
  const fm = m ? m[1] : "";
  return /^status:\s*approved\s*$/m.test(fm);
}

const feat = activeFeature(cwd);
const spec = join(cwd, "specs", feat, "spec.md");
const plan = join(cwd, "specs", feat, "plan.md");
if (feat && isApproved(spec) && isApproved(plan)) process.exit(0);

// --- trivial-change path ----------------------------------------------------
// How big is this edit? Edit carries the replaced text, Write the whole content.
const lineCount = (s) => (s ? String(s).split("\n").length : 0);
const size = Math.max(lineCount(ti.new_string), lineCount(ti.old_string), lineCount(ti.content));

const marker = join(cwd, ".specify", "trivial");
let reason = "";
let stale = false;
if (existsSync(marker)) {
  try {
    reason = readFileSync(marker, "utf8").trim().split("\n")[0].trim();
    stale = (Date.now() - statSync(marker).mtimeMs) / 60000 > TTL_MIN;
  } catch {}
}

if (reason && !stale && size <= MAX_LINES) {
  process.stderr.write(
    `[keel:phase-gate] trivial-change path: "${reason}" (${size} line(s)). Announce this skip in your response.\n`,
  );
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: `keel trivial-change path: ${reason}`,
      },
    }),
  );
  process.exit(0);
}

let why = `feature '${feat || "none"}' has no approved spec.md+plan.md (need 'status: approved' in both)`;
if (reason && stale) {
  why += `; the .specify/trivial marker went stale (older than ${TTL_MIN} min) — rewrite it if this is still a trivial change`;
} else if (reason && size > MAX_LINES) {
  why += `; this edit touches ${size} lines, past the ${MAX_LINES}-line trivial limit — the kind of change the flow exists for`;
}

process.stderr.write(
  `[keel:phase-gate] Blocked: ${why}. Run the SDD flow (spec-writer -> plan-writer) before editing code. ` +
    `For a genuinely trivial change (typo, mechanical rename, one-line config), write the reason into ` +
    `.specify/trivial and retry — that path allows edits up to ${MAX_LINES} lines and announces itself.\n`,
);
process.exit(2);
