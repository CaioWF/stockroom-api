#!/usr/bin/env node
// PreToolUse(Bash) gate: when a `git commit` is about to run, execute the
// project's quality gates first; block the commit if they fail.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readEvent } from "./_lib.mjs";

const ev = await readEvent();
const cwd = ev.cwd || process.cwd();
const cmd = (ev.tool_input && ev.tool_input.command) || "";

// Only act on git commit.
if (!cmd.includes("git commit")) process.exit(0);

const gates = join(cwd, ".specify", "gates", "run-gates.sh");
if (!existsSync(gates)) process.exit(0); // no gates installed -> do not block

const r = spawnSync("bash", [gates, cwd], { stdio: ["ignore", 2, 2] });
if (r.status === 0) process.exit(0);

process.stderr.write(
  "[keel:precommit-gate] Blocked commit: quality gates failed. Fix them before committing.\n",
);
process.exit(2);
