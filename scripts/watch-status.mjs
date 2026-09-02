#!/usr/bin/env node
// Read-only status of a keel project's in-flight work: features and their phase,
// task counts, tasks currently dispatched (a brief with no report yet), the progress
// ledger, and live worktrees. Written for a tmux pane — see scripts/keel-watch.sh.
//
// Reads only. Nothing here writes, commits, or touches the dispatch artifacts.
// Zero-dep: node: builtins plus git.
//
// Usage: node scripts/watch-status.mjs [--dir <path>] [--watch [seconds]]
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join, resolve } from "node:path";

const args = process.argv.slice(2);
let dir = process.cwd();
let interval = 0;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--dir") dir = resolve(args[++i] ?? ".");
  else if (args[i] === "--watch") {
    const next = args[i + 1];
    interval = next && /^\d+$/.test(next) ? parseInt(args[++i], 10) : 5;
  }
}

const git = (a, cwd = dir) => {
  try {
    return execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

// The phase machine and active-feature resolution already live in the hook lib;
// importing them keeps one definition rather than a second, drifting copy.
const libPath = join(dir, ".claude", "hooks", "_lib.mjs");
if (!existsSync(libPath)) {
  process.stderr.write(`[keel:watch] not a keel project (no ${libPath})\n`);
  process.exit(1);
}
const { activeFeature, phase } = await import(`file://${libPath}`);

const age = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

const mtime = (p) => {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
};

// Top-level task checkboxes only; sub-steps are indented and would inflate the count.
function taskCounts(feature) {
  const f = join(dir, "specs", feature, "tasks.md");
  if (!existsSync(f)) return null;
  const lines = readFileSync(f, "utf8").split("\n");
  const done = lines.filter((l) => /^- \[x\]/i.test(l)).length;
  const open = lines.filter((l) => /^- \[ \]/.test(l)).length;
  return { done, total: done + open };
}

// A dispatched task announces itself as a brief; the implementer's report lands only
// when it finishes. Brief without report = still running (or died mid-flight).
function sddState(feature) {
  const common = git(["rev-parse", "--git-common-dir"]);
  if (!common) return null;
  const base = join(resolve(dir, common), "sdd", feature);
  if (!existsSync(base)) return null;
  let names = [];
  try {
    names = readdirSync(base);
  } catch {
    return null;
  }
  const inFlight = [];
  for (const n of names) {
    const m = n.match(/^(.*)-brief\.md$/);
    if (m && !names.includes(`${m[1]}-report.md`)) {
      inFlight.push({ task: m[1], since: mtime(join(base, n)) });
    }
  }
  inFlight.sort((a, b) => a.task.localeCompare(b.task));
  const ledgerPath = join(base, "progress.md");
  const ledger = existsSync(ledgerPath)
    ? {
        path: ledgerPath,
        tail: readFileSync(ledgerPath, "utf8").split("\n").filter(Boolean).slice(-3),
        at: mtime(ledgerPath),
      }
    : null;
  return { base, inFlight, ledger };
}

function worktrees() {
  const out = git(["worktree", "list", "--porcelain"]);
  if (!out) return [];
  const list = [];
  let cur = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      cur = { path: line.slice(9), branch: "detached" };
      list.push(cur);
    } else if (line.startsWith("branch ") && cur) {
      cur.branch = line.slice(7).replace("refs/heads/", "");
    }
  }
  for (const w of list) {
    const st = git(["status", "--porcelain"], w.path);
    w.dirty = st ? st.split("\n").length : 0;
  }
  return list;
}

function render() {
  const out = [];
  const active = activeFeature(dir);
  const specs = join(dir, "specs");
  const features = existsSync(specs)
    ? readdirSync(specs).filter((n) => statSync(join(specs, n)).isDirectory()).sort()
    : [];

  out.push(`keel watch · ${basename(dir)} · ${new Date().toTimeString().slice(0, 8)}`);

  if (!features.length) {
    out.push("\nno features under specs/ yet");
  } else {
    out.push("");
    out.push("  FEATURE".padEnd(30) + "PHASE".padEnd(13) + "TASKS".padEnd(9) + "IN FLIGHT");
    for (const f of features) {
      const c = taskCounts(f);
      const s = sddState(f);
      const flight = s?.inFlight.length
        ? s.inFlight.map((t) => `${t.task} (${age(t.since)})`).join(", ")
        : "—";
      out.push(
        `${f === active ? "* " : "  "}${f}`.padEnd(30) +
          phase(dir, f).padEnd(13) +
          (c ? `${c.done}/${c.total}` : "—").padEnd(9) +
          flight,
      );
    }

    for (const f of features) {
      const s = sddState(f);
      if (!s?.ledger) continue;
      out.push(`\n${f} · ledger tail (${age(s.ledger.at)})`);
      for (const l of s.ledger.tail) out.push(`  ${l}`);
    }
  }

  const w = worktrees();
  if (w.length) {
    out.push(`\nworktrees (${w.length})`);
    for (const t of w) {
      const mark = resolve(t.path) === resolve(dir) ? "*" : " ";
      const state = t.dirty ? `${t.dirty} changed` : "clean";
      out.push(`  ${mark} ${t.path.padEnd(46)} ${t.branch.padEnd(24)} ${state}`);
    }
  }

  return out.join("\n") + "\n";
}

if (interval) {
  const tick = () => process.stdout.write(`\x1b[2J\x1b[H${render()}`);
  tick();
  setInterval(tick, interval * 1000);
} else {
  process.stdout.write(render());
}
