---
name: product-writer
description: Use once per project, before any feature work, to fill out the project product brief (product, user, problem/value, north-star metric, non-goals) from the product template into .specify/memory/product.md. The product layer that pairs the engineering-only constitution.
---

# product-writer

When: entry point of the SDD flow, alongside `constitution-writer`. Run once per project, before the first feature is brainstormed or specced. Re-run (or edit in place) only when the product's direction actually changes — a new audience, a repositioned value proposition, a different north-star.

Why it exists: the constitution is the **engineering** layer (principles, code standards, architecture, SDD process). It says nothing about *who the user is, what the product is, or why it exists*. Without a product layer, every feature's `prd.md` re-derives that context from scratch — duplicated, and free to drift feature to feature. This brief is written once and **referenced** by each PRD, so the product context is stated in one place and stays coherent across features.

Template: `.specify/memory/product.md.tmpl`.

Output: `.specify/memory/product.md`.

Steps:
1. Check whether `.specify/memory/product.md` already exists. If it does, treat this as an edit, not a fresh fill — read it first and preserve decisions still valid.
2. If `product.md` is absent, **rename** `.specify/memory/product.md.tmpl` to `.specify/memory/product.md` (the brief is one-per-project; the template is consumed, not kept). After filling, remove any leftover `product.md.tmpl` so only `product.md` remains.
3. Fill each section that exists in the template:
   - `Product` — what the product is and why it exists, in 1-2 sentences.
   - `User` — the target user and their jobs-to-be-done / core usage scenarios.
   - `Problem & Value Proposition` — the central problem the product solves and why this product over the alternative.
   - `North-star Metric` — the single north-star metric that best captures delivered value (distinct from the per-feature KPIs that live in each `prd.md`).
   - `Non-goals` — what the product deliberately is NOT / does not do, at the product level (distinct from a feature's phase-level "Out of Scope").
4. Keep entries concrete and project-specific — avoid restating the template's bracketed placeholders verbatim. Stay at product altitude: no engineering decisions (those belong in the constitution), no feature-level detail (that belongs in a PRD).
5. Do not invent a `status:` frontmatter for this file; the brief has no approval gate, exactly like the constitution.

Next: constitution-writer if the engineering layer is not yet written, then brainstorming (to shape the first feature idea).
