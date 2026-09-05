---
name: source-driven-development
description: Use when writing framework- or library-specific code — an API call, config, lifecycle hook, or pattern whose exact shape you are recalling from memory rather than confirming. Invoke before adopting a framework idiom, when unsure whether an API signature is current, or whenever a decision depends on version-specific behavior.
---

# source-driven-development

## Overview

Don't code framework specifics from memory — verify against official documentation, then cite the source so a human can check you. Training data goes stale; APIs deprecate; a plausible-looking signature can be a version behind. The discipline: **Detect → Fetch → Implement → Cite**.

Adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) `source-driven-development` (MIT, © 2025 Addy Osmani).

## When to use

- Using a framework/library API whose current signature you are not certain of.
- Adopting a lifecycle hook, config key, or idiom that changes across major versions.
- A decision hinges on version-specific behavior (a default that flipped, a removed option).

**Skip** for plain language-level code, project-internal APIs (read the source, not docs), and idioms you can confirm directly from the installed version's types.

## The technique — Detect → Fetch → Implement → Cite

1. **Detect** the stack and exact versions from dependency manifests (`package.json`, `Gemfile`, `pyproject.toml`, `go.mod`, `pom.xml`, …). Ambiguous? Ask rather than assume. Version matters — the docs you fetch must match the version installed.

2. **Fetch** the official docs for the *specific* feature, not the homepage. Prefer keel's available tooling: the `context7` MCP (`resolve-library-id` → `query-docs`) for library docs, `WebFetch`/`WebSearch` for official pages. Authority order:
   - official documentation for the installed version
   - official blog/changelog/release notes
   - web standards (MDN, WHATWG) and runtime/browser compatibility data
   - **Never as primary source:** Stack Overflow, random tutorials, AI summaries, your own training memory.

3. **Implement** to match the docs exactly — current API signatures, current patterns, no deprecated calls. Flag anything you could not verify instead of guessing past it.

4. **Cite** so the human can audit:
   - a source URL in a code comment next to the non-obvious usage (comment the WHY, per house style),
   - the relevant quote in conversation (keep quotes short),
   - surface any conflict between the docs and existing code rather than silently conforming to either.

## Relationship to stack-conventions

The `stack-conventions` pack encodes *how this project writes* TS/Postgres/etc. (house style). This skill governs *whether a framework fact is current* (external truth). Use both: conventions for shape, source-driven for correctness against the live API.

## Red Flags

- **Coding from memory** — writing framework code without opening current docs because it "looks right."
- **"I think / I believe"** in place of a citation. If you cannot cite it, mark it unverified.
- **Version blindness** — fetching docs without detecting the installed version, so you cite behavior the project doesn't have.
- **Laundering a tutorial** — citing a blog or Stack Overflow answer as if it were the authoritative source.
- **Shipping unverified** — deprecated APIs, unflagged assumptions, conflicts with existing code left unsurfaced.
