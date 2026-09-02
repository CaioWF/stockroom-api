# Tasks — [Feature]

## Implementation Checklist

> Every task that delivers an acceptance criterion must cite the corresponding `AC-N` from the
> spec (e.g. `(AC-1)`). The `eval-spec-fidelity` gate fails if any `AC-N` in the spec has no task.
>
> Each task can declare its **file scope** with `[scope: glob, glob]` — the globs it will
> touch (derived from the plan's `File Structure`). Tasks with disjoint scopes can run in
> parallel in `dispatch-parallel` mode (see `execution-mode-routing`). Without `[scope: …]`,
> or with a broad glob (`**`, `*`), the task never parallelizes — it runs alone (safe default).

- [ ] Task 1: Task description (AC-1) [scope: src/moduleA/**, tests/moduleA/**]
- [ ] Task 2: Task description (AC-2) [scope: src/moduleB/**, tests/moduleB/**]
- [ ] Task 3: Task description
- [ ] Task 4: Task description
- [ ] Task 5: Task description

## Subtasks

### Task 1
- [ ] Subtask 1.1
- [ ] Subtask 1.2

### Task 2
- [ ] Subtask 2.1
- [ ] Subtask 2.2

## Blockers

- [List of known blockers or dependencies]

## Notes

- [Important notes for execution]
