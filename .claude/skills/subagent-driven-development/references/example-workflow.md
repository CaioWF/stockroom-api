# Example workflow (subagent-driven-development)

A full worked run of the loop, from milestone snapshot through final review.
Read it when you want a concrete end-to-end trace of the process.

```
You: I'm using Subagent-Driven Development to execute this plan.

[Read plan file once: specs/feature/plan.md]
[Create todos for all tasks]
[git add -A && git write-tree -> MILESTONE_START = abc123...]

Task 1: Hook installation script

[Extract Task 1 brief; BASE = MILESTONE_START; dispatch implementer with brief + report paths + context + no-commit instruction]

Implementer: "Before I begin - should the hook be installed at user or system level?"

You: "User level (~/.config/keel/hooks/)"

Implementer: "Got it. Implementing now..."
[Later] Implementer:
  - Implemented install-hook command
  - Added tests, 5/5 passing
  - Self-review: Found I missed --force flag, added it
  - Reported DONE (no commit)

[git add -A && git write-tree -> HEAD1 = def456...]
[Dispatch task reviewer with diff BASE..HEAD1]
Task reviewer: Spec ✅ - all requirements met, nothing extra.
  Strengths: Good test coverage, clean. Issues: None. Task quality: Approved.

[Mark Task 1 complete; ledger: "Task 1: complete (tree abc123..def456, review clean)"]

Task 2: Recovery modes

[Extract Task 2 brief; BASE = HEAD1; dispatch implementer with brief + report paths + context]

Implementer: [No questions, proceeds]
Implementer:
  - Added verify/repair modes
  - 8/8 tests passing
  - Self-review: All good
  - Reported DONE (no commit)

[git add -A && git write-tree -> HEAD2]
[Dispatch task reviewer with diff HEAD1..HEAD2]
Task reviewer: Spec ❌:
  - Missing: Progress reporting (spec says "report every 100 items")
  - Extra: Added --json flag (not requested)
  Issues (Important): Magic number (100)

[Dispatch fix subagent with all findings]
Fixer: Removed --json flag, added progress reporting, extracted PROGRESS_INTERVAL constant

[git add -A && git write-tree -> HEAD2']
[Task reviewer reviews again with diff HEAD1..HEAD2']
Task reviewer: Spec ✅. Task quality: Approved.

[Mark Task 2 complete; ledger updated]

...

[After all tasks: git write-tree -> MILESTONE_END]
[Dispatch final whole-branch reviewer with diff MILESTONE_START..MILESTONE_END]
Final reviewer: All requirements met, ready to merge

[Report milestone ready; propose commit message(s); wait for explicit human approval before running git commit]
```
