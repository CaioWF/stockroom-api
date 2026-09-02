// Shared resolvers for keel hooks. Zero-dep: node: builtins only. Import me.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Read the hook event JSON from stdin; never throw.
export async function readEvent() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

// The active feature: explicit .specify/state wins, else newest specs/ subdir.
export function activeFeature(dir) {
  const state = join(dir, ".specify", "state");
  if (existsSync(state)) {
    const first = readFileSync(state, "utf8").split("\n")[0].trim();
    if (first) return first;
  }
  const specs = join(dir, "specs");
  if (!existsSync(specs)) return "";
  let best = "";
  let bestMtime = -1;
  for (const name of readdirSync(specs)) {
    const p = join(specs, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory() && st.mtimeMs > bestMtime) {
      bestMtime = st.mtimeMs;
      best = name;
    }
  }
  return best;
}

// The SDD phase, derived from which artifacts exist for the feature.
export function phase(dir, feat) {
  if (!feat) return "constitution";
  const f = join(dir, "specs", feat);
  if (!existsSync(join(f, "prd.md"))) return "prd";
  if (!existsSync(join(f, "spec.md"))) return "spec";
  if (!existsSync(join(f, "plan.md"))) return "plan";
  if (!existsSync(join(f, "tasks.md"))) return "tasks";
  return "implement";
}
