#!/usr/bin/env node
// UserPromptSubmit hook: report the current SDD phase + active feature.
import { readEvent, activeFeature, phase } from "./_lib.mjs";

const ev = await readEvent();
const cwd = ev.cwd || process.cwd();
const feat = activeFeature(cwd);
const ph = phase(cwd, feat);
const msg = `[keel] SDD phase: ${ph} (feature: ${feat || "none"}). Next: run the ${ph}-writer skill (or implement-feature).`;
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: msg,
    },
  }),
);
