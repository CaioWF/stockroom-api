#!/usr/bin/env node
// PreToolUse(Bash) guard: intercept destructive shell commands before they run.
// Two tiers, most-severe-wins across a chained command line:
//   BLOCK (exit 2)  -> catastrophic / irreversible, no legit reason in a normal
//                      dev flow (force-push, DROP DATABASE, mkfs, dd to a disk,
//                      terraform destroy, `rm -rf /`). The agent must reconsider.
//   ASK  (permissionDecision:"ask") -> destructive but routinely legitimate
//                      (`rm -rf <path>`, git reset --hard, DROP TABLE, kubectl
//                      delete...). The user gets a confirm prompt.
// Everything else falls through (exit 0). Safe throwaway paths (node_modules,
// dist, /tmp, .git/sdd...) are whitelisted so `rm -rf` on build junk never nags.
//
// This is a guardrail, not a security boundary — detection is best-effort regex
// over the command string (obfuscation, aliases, indirection can slip through),
// mirroring secrets-guard.mjs. If "ask" is unsupported by the running Claude Code
// it degrades to allow, never to a false block. Editable policy below.
import { readEvent } from "./_lib.mjs";

const ev = await readEvent();
if ((ev.tool_name || "") !== "Bash") process.exit(0);
const cmd = String((ev.tool_input && ev.tool_input.command) || "");
if (!cmd.trim()) process.exit(0);

function block(reason) {
  process.stderr.write(
    `[keel:destructive-guard] Blocked: ${reason} ` +
      `This is catastrophic/irreversible and disabled by default. If you truly ` +
      `intend it, run it yourself or edit .claude/hooks/destructive-guard.mjs.\n`,
  );
  process.exit(2);
}
function ask(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: `[keel:destructive-guard] ${reason} Confirm to proceed.`,
      },
    }),
  );
  process.exit(0);
}

// --- rm -rf classification -------------------------------------------------
// A path is CATASTROPHIC (block) if it names a system/home root.
const CATASTROPHIC_PATH =
  /^(\/|\/\*|~|~\/\*|\$HOME|\$\{HOME\}|\/(etc|usr|var|bin|sbin|boot|lib\w*|opt|sys|proc|dev|root|home)(\/\*?)?)$/;
// A path is SAFE (allow) if it clearly names throwaway build/temp artifacts.
const SAFE_RM_PATH =
  /(^|\/)(node_modules|dist|build|out|\.next|\.nuxt|target|coverage|\.cache|\.turbo|\.parcel-cache|tmp|temp|\.git\/sdd)(\/|$)|^\/tmp\/|\.(log|tmp)$|(^|\/)scratchpad(\/|$)/;

function unquote(t) {
  return t.replace(/^['"]|['"]$/g, "");
}
// Does this single segment invoke a recursive rm? (-r / -rf / --recursive)
function recursiveRm(seg) {
  if (!/\brm\b/.test(seg)) return false;
  const flags = (seg.match(/\s-[a-zA-Z]+/g) || []).join("");
  return /r/.test(flags) || /--recursive/.test(seg);
}
// Targets of an rm: non-flag tokens after `rm`.
function rmTargets(seg) {
  const toks = seg.split(/\s+/);
  const i = toks.findIndex((t) => t === "rm" || t.endsWith("/rm"));
  if (i < 0) return [];
  return toks
    .slice(i + 1)
    .filter((t) => t && t !== "--" && !t.startsWith("-"))
    .map(unquote);
}

// --- pattern tiers (checked against the whole command line) ----------------
const BLOCK_PATTERNS = [
  [/\bgit\s+push\b[^|;&\n]*?(?<![-\w])(--force(?!-with-lease)|-f)(?=\s|$|=)/, "git force-push overwrites remote history"],
  [/\b(dropdb|DROP\s+DATABASE)\b/i, "dropping a database is irreversible"],
  [/\bdropDatabase\s*\(/, "dropping a Mongo database is irreversible"],
  [/\bmkfs(\.\w+)?\b/, "mkfs formats a filesystem"],
  [/\bwipefs\b/, "wipefs erases filesystem signatures"],
  [/\bdd\b[^|;&\n]*\bof=\/dev\/(sd|nvme|hd|vd|mmcblk|disk|loop)/, "dd to a block device destroys the disk"],
  [/(^|[\s>])>\s*\/dev\/(sd|nvme|hd|vd|mmcblk|disk|loop)/, "redirect to a block device destroys the disk"],
  [/\bterraform\s+destroy\b/, "terraform destroy tears down infrastructure"],
];
const ASK_PATTERNS = [
  [/\bgit\s+reset\s+[^|;&\n]*--hard\b/, "git reset --hard discards uncommitted work"],
  [/\bgit\s+clean\s+-\S*[fd]\S*/, "git clean removes untracked files"],
  [/\bgit\s+checkout\s+(--\s+\.|\.)(\s|$)/, "git checkout discards working-tree changes"],
  [/\bgit\s+restore\s+(--\s+)?\.(\s|$)/, "git restore discards working-tree changes"],
  [/\bgit\s+branch\s+-D\b/, "git branch -D force-deletes a branch"],
  [/\bgit\s+push\b[^|;&\n]*(--force-with-lease|--delete\b|\s:\w)/, "git push deletes/rewrites a remote branch"],
  [/\bDROP\s+TABLE\b/i, "DROP TABLE deletes a table"],
  [/\bTRUNCATE\b/i, "TRUNCATE empties a table"],
  [/\bFLUSH(ALL|DB)\b/i, "Redis FLUSH wipes keys"],
  [/\.drop\s*\(\s*\)/, "collection .drop() deletes data"],
  [/\bdeleteMany\s*\(\s*\{\s*\}\s*\)/, "deleteMany({}) deletes every document"],
  [/\bkubectl\s+delete\b/, "kubectl delete removes cluster resources"],
  [/\bhelm\s+(delete|uninstall)\b/, "helm uninstall removes a release"],
];

// Split into segments so `safe && rm -rf /` still catches the dangerous half.
const segs = cmd.split(/\n|;|&&|\|\||[|&]/).map((s) => s.trim()).filter(Boolean);

let asked = null; // remember first ask reason; block wins if we hit one later.

for (const seg of segs) {
  // rm -rf tiering
  if (recursiveRm(seg)) {
    const targets = rmTargets(seg);
    for (const t of targets) {
      if (CATASTROPHIC_PATH.test(t)) block(`\`rm\` on a system root (${t}).`);
    }
    const dangerous = targets.filter((t) => !SAFE_RM_PATH.test(t));
    if (dangerous.length) asked ??= `recursive delete of ${dangerous.join(", ")}.`;
  }
  // pattern tiers
  for (const [re, why] of BLOCK_PATTERNS) if (re.test(seg)) block(`${why}.`);
  for (const [re, why] of ASK_PATTERNS) if (re.test(seg)) asked ??= `${why}.`;
}

if (asked) ask(asked);
process.exit(0);
