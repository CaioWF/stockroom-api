---
name: receiving-code-review
description: Use when receiving code review feedback (from the user, a human reviewer, or the review-and-simplify lenses), before implementing suggestions — especially if feedback seems unclear or technically questionable. Requires technical rigor and verification, not performative agreement or blind implementation.
---

# Receiving Code Review

## Overview

Code review requires technical evaluation, not emotional performance.

**Core principle:** Verify before implementing. Ask before assuming. Technical correctness over social comfort.

## The Response Pattern

```
WHEN receiving code review feedback:
1. READ:      complete feedback without reacting
2. UNDERSTAND: restate the requirement in your own words (or ask)
3. VERIFY:    check against codebase reality
4. EVALUATE:  technically sound for THIS codebase?
5. RESPOND:   technical acknowledgment or reasoned pushback
6. IMPLEMENT: one item at a time, test each
```

## Forbidden Responses

NEVER: "You're absolutely right!" · "Great point!" · "Thanks for catching that!" · "Let me implement that now" (before verification). No gratitude theatre.

INSTEAD: restate the technical requirement · ask clarifying questions · push back with technical reasoning if wrong · just start working (actions > words).

If you catch yourself about to write "Thanks" — delete it, state the fix instead. The code shows you heard the feedback.

## Handling Unclear Feedback

If ANY item is unclear: STOP — implement nothing yet. Ask for clarification on the unclear items first. Items may be related; partial understanding = wrong implementation.

> ❌ implement 1,2,3,6 now, ask about 4,5 later
> ✅ "I understand items 1,2,3,6. Need clarification on 4 and 5 before proceeding."

## Source-Specific Handling

**From the user:** trusted — implement after understanding. Still ask if scope is unclear. No performative agreement; skip to action or a technical acknowledgment.

**From an external reviewer (or a review lens):** be skeptical, verify carefully. Before implementing, check:
1. Technically correct for THIS codebase?
2. Breaks existing functionality?
3. Is there a reason for the current implementation?
4. Works on all target platforms/versions?
5. Does the reviewer have full context?

If a suggestion seems wrong → push back with technical reasoning. If you can't verify → say so: "I can't verify this without [X]. Should I investigate / ask / proceed?" If it conflicts with the user's prior architectural decisions → stop and discuss with the user first.

## YAGNI Check

If a reviewer suggests "implementing properly" / adding a feature: grep the codebase for actual usage. If unused → "This isn't called anywhere. Remove it (YAGNI)?" If used → implement properly.

## Implementation Order

For multi-item feedback: clarify the unclear FIRST, then implement blocking issues (breaks, security) → simple fixes (typos, imports) → complex fixes (refactoring, logic). Test each fix individually; verify no regressions. Re-run `.specify/gates/run-gates.sh` after.

## When To Push Back

Push back when the suggestion: breaks existing functionality · the reviewer lacks full context · violates YAGNI · is technically incorrect for this stack · has legacy/compatibility reasons · conflicts with the user's architectural decisions (constitution / ADRs).

**Blocking claims need a citation.** A reviewer calling something a violation must quote the rule — a constitution line, an `AC-N`, a checklist item, a failing gate. Uncited, it is a suggestion: evaluate it on technical merit like any other, but it does not block. Ask for the citation instead of assuming it exists — "Which rule does this break? I don't find it in the constitution." This cuts both ways: when the citation IS there, the rule was already agreed — implement it, or take it to the user to change the rule. Do not relitigate an agreed rule inside the review.

How: technical reasoning, not defensiveness · ask specific questions · reference working tests/code · involve the user if architectural. If uncomfortable pushing back, name the tension and tell the user what you saw.

## Acknowledging / Correcting

Correct feedback: "Fixed. [what changed]" or "Good catch — [issue]. Fixed in [location]." Not gratitude.

You pushed back and were wrong: "You were right — checked [X], it does [Y]. Implementing now." State the correction factually and move on. No long apology, no defending the pushback.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Performative agreement | State the requirement or just act |
| Blind implementation | Verify against the codebase first |
| Batch without testing | One at a time, test each |
| Assuming the reviewer is right | Check if it breaks things |
| Avoiding pushback | Technical correctness > comfort |
| Partial implementation | Clarify all items first |
| Can't verify, proceed anyway | State the limitation, ask for direction |

## GitHub thread replies

When replying to inline PR review comments, reply in the comment thread (`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`), not as a top-level PR comment.

## Bottom line

External feedback = suggestions to evaluate, not orders to follow. Verify. Question. Then implement. Technical rigor always.
