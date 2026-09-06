---
name: okf-enrich
description: Ingest a raw source into the project's OKF knowledge bundle — distill it into concept pages, refresh the index, and log the change. keel's compounding "LLM wiki" loop.
---

# okf-enrich

**When:** The human hands you a source (a file, URL, pasted text, or repo path) worth remembering durably. Fold it into the knowledge bundle instead of answering once and discarding.

**Inputs:** source (required); target bundle (default `docs/`).

**Output:** updated concept pages, refreshed index, and change log entry.

## The Loop

### Step 1: Read and Extract Concepts

Read the source fully. Identify the distinct CONCEPTS worth their own page — entities, decisions, APIs, playbooks, patterns, not one page per paragraph. Aim for a handful per ingest.

### Step 2: Survey Existing Types

Read the bundle's existing concept `type:` values (from `<bundle>/index.md` or by scanning the bundle directory). REUSE a fitting existing type rather than inventing a synonym — new type only for a genuinely new kind. Converge types; never sprawl them. This is the whitelist discipline: allowed types are those already in the bundle.

### Step 3: Upsert Concept Pages

For each concept, write or update a page at `<bundle>/<subdir>/<slug>.md`:

**Frontmatter** (required keys):
- `type` — reused or new concept type
- `title` — concept name
- `description` — one sentence
- `tags` — optional, comma-separated
- `timestamp` — ISO date (e.g., today's date)

**Body:**
- Prose summary in your own words
- Use OKF body conventions where they fit: `# Schema` for structured fields, `# Examples` for worked examples
- **ALWAYS end with `# Citations`** — list the source (URL, file path, or reference) so all claims are traceable to their origin
- Cross-link related concepts using **relative markdown links** (e.g., `[Title](../design-notes/XXXX.md)` — OKF-conformant and portable) to grow the knowledge graph

**Update rule:** If a page for this concept already exists, MERGE the new facts into it. Preserve existing frontmatter keys and content; never clobber.

### Step 4: Refresh the Index

Run:
```bash
node .specify/gates/okf-build-index.mjs build <bundle>
```

This regenerates the bundle's per-directory `index.md` tree from the current concepts (freshness is verified separately in Step 6 with `check`, and again by the commit gate).

### Step 5: Log the Change

Append to `<bundle>/log.md` (create if absent). This is the OKF reserved change history, **NEWEST-FIRST**. Format:

```
## 2026-07-10
* **Creation**: path/to/concept.md — brief summary of what/why
* **Update**: path/to/existing.md — what changed
```

Prepend today's dated block above older entries. (Note: `index.md` and `log.md` are OKF RESERVED — never make them concepts; they carry no `type:` frontmatter and are ignored by the concept hook.)

### Step 6: Lint the Bundle

Run:
```bash
node .specify/gates/okf-build-index.mjs check <bundle>
```

**REPORT findings** (do not auto-fix):
- Freshness status (index match)
- Orphan pages (no inbound or outbound links)
- Obvious contradictions with existing pages
- Stale or unverified claims

Surface all of these to the human. They curate; you distill.

### Step 7: Hand Back

Summarize:
- Which pages were created or updated
- What the lint found (pass/warnings)
- Suggest `okf-visualize <bundle>` to view the updated graph if helpful

## Hard Rules

- **Never commit.** Accumulate changes; the human approves.
- **Never clobber existing pages.** Merge facts; preserve existing frontmatter and content.
- **Never invent a new `type`** when an existing one fits the concept.
- **Always cite sources.** Every claim must trace back to its origin via `# Citations`.
- **Tolerate broken links.** OKF requires downstream consumers to resolve them; you do not.
- **Use whitelist discipline on types.** Converge to existing types; new types only for genuinely new kinds of concept.

## Integration

**Companion gates/tools** (under `.specify/gates/`, invoked by name — not skills):
- `okf-build-index.mjs` — `build` rewrites the index; `check` is the freshness gate the commit hook runs
- `okf-visualize.mjs` — renders the bundle as a self-contained HTML knowledge graph

**Related skills / hooks:**
- SessionStart OKF hook (`okf-index.mjs`) — surfaces every typed concept as a map on session start
- `source-driven-development` — source/citation discipline if present

**Keel discipline:** This skill does NOT participate in the SDD feature chain. It runs ad hoc when the human brings a source to fold into the durable knowledge base.
