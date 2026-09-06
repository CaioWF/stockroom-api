---
name: a11y-review
description: Accessibility lens (WCAG) over a UI feature's changed code — read-only. Appended to review-and-simplify's lens registry by the ui-review pack. Also usable standalone.
---

# a11y-review

When: dispatched by `review-and-simplify` as one of its parallel lenses, on the feature's diff, in projects where the `ui-review` pack is installed. Also usable standalone for a focused accessibility pass.

Scope: the changed UI code only — the feature's tree-snapshot diff (`git diff BASE_TREE HEAD_TREE`, per `subagent-driven-development`'s no-commit-rule snapshotting) or, if no snapshots exist, the working tree diff. Never the whole repo. If the diff touches no UI surface (markup, components, styles, templates), report "no a11y-relevant changes" and stop — do not manufacture findings.

Output: findings by severity (Critical/Important/Minor) with `file:line`, reported inline. Makes NO edits.

## Calibration

Judge against WCAG 2.2 Level AA. Flag only what the changed code actually introduces or regresses — not pre-existing debt in untouched code.

- **Perceivable:** images/icons without text alternatives (`alt`, `aria-label`); meaningful color as the only signal; contrast below AA on new text/controls; media without captions.
- **Operable:** interactive elements not reachable or activatable by keyboard; missing/incorrect focus management on new dialogs/menus/routes; focus traps; custom controls without a visible focus indicator; touch targets too small.
- **Understandable:** form inputs without associated labels; error states conveyed only visually; unexpected context changes on focus/input.
- **Robust:** non-semantic elements (`div`/`span`) used as buttons/links without role + keyboard handlers; wrong or missing ARIA (invented roles, `aria-*` on elements that don't support them); state not exposed (`aria-expanded`, `aria-checked`, `aria-invalid`).

Native mobile (iOS/Android) equivalents count too: missing accessibility labels/traits, focus order, and Dynamic Type / large-text support on changed screens.

Prefer a real barrier over a lint-style nit: a `div` onClick with no keyboard path is Critical; a slightly terse `alt` is Minor. Do not restate what a deterministic linter (eslint-plugin-jsx-a11y, etc.) already gate-blocks — this lens is for the judgment a linter can't encode (is the label *meaningful*? is focus order *sensible*?).

Next: findings return to `review-and-simplify`, which aggregates them with the other lenses; Critical/Important must be fixed before the pre-commit gate.
