---
name: codebase-map
description: Use at feature start (or when the map is stale) to map the repo's structure ONCE into docs/codebase-map.md — a token-lean, depth-limited structural map that plan-writer, analyze, and implement-feature reuse instead of re-exploring the tree each phase.
---

# codebase-map

When: at the start of a non-trivial feature/refactor, before or during `plan-writer`, in a repo the current session has not already mapped — or when `docs/codebase-map.md` exists but the structure has drifted (new top-level modules, moved boundaries). Skip on a repo small enough to hold in head, or when a fresh map already exists this session. Companion skill, not a forced chain link.

Template: none — produces a generated artifact, not a filled template.

Output: `docs/codebase-map.md` — a living artifact. Seed once, then refresh in place; never a per-feature file. Token-lean by design: it is read many times (every downstream phase), so it favors a scannable map over prose.

Steps:
1. If `docs/codebase-map.md` exists and the structure has not drifted, stop — reuse it. Do not regenerate for cosmetic reasons.
2. Map the tree at bounded depth (≈3 levels; do not recurse into `node_modules`, `dist`, `build`, `.git`, vendored deps, or generated output). Prefer one broad `Explore`/`Glob` fan-out over reading whole files — locate structure, don't audit code.
3. Capture, as a scannable map (not prose):
   - **Top-level layout** — the dirs that matter and one line each on what lives there.
   - **Entry points** — where execution starts (main/index/CLI/server bootstrap, route roots).
   - **Layer/module boundaries** — the architectural seams (e.g. api ↔ domain ↔ data), and the direction dependencies are allowed to point.
   - **Key conventions the tree already shows** — file naming, test placement, where migrations/schema live, the validation lib in use, the ORM/mapper site (feeds `naming-conventions`/`postgres-conventions` when the `stack-conventions` pack is installed).
   - **Where a new feature of the requested kind would go** — the concrete dirs a plan should touch.
4. Keep it lean: a map, not a tour. No line-by-line file summaries; link paths, don't quote code. If a section would be guesswork, mark it `TODO/uncertain` rather than inventing.
5. Write/refresh `docs/codebase-map.md`. Record the commit/date it reflects at the top so drift is detectable later.

Next: `plan-writer` reads `docs/codebase-map.md` to ground `Architecture` / `File Structure` in the real structure; `analyze` and `implement-feature` reuse it. Regenerate when the structure drifts, not per feature.
