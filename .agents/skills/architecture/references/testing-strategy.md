# Testing strategy (language-agnostic)

Where to invest testing effort and why. The **how** (the red-green-refactor cycle, behavior over
implementation) lives in the `test-driven-development` skill — this note doesn't rewrite it, just positions it.

## The pyramid

- **Unit (base, majority):** domain and use cases tested in isolation, without framework/network/database.
  Fast, deterministic. Clean Architecture makes this cheap — the domain is pure.
- **Integration (middle):** real adapters against their dependencies (containerized database, fake HTTP).
  Verifies that ports match their implementations.
- **End-to-end (top, few):** user flow through the assembled application. Expensive and more
  fragile — cover critical paths, not everything.

Anti-pyramid (lots of E2E, little unit) = a slow, flaky suite. If testing the domain requires
spinning up the world, the boundary is wrong (go back to the dependency rule).

## Principles (reinforce `test-driven-development`)

- **Test behavior, not implementation:** assert on inputs/outputs/observable effects. A
  test that breaks on a behavior-preserving refactor is testing implementation — rewrite it.
- **Don't assert on mocks:** a mock is for isolating an edge dependency, not for being the
  object under test. Prefer fakes over mocks that verify internal calls.
- **Name by behavior:** the test name describes the business rule, not the method.
- **Pure domain = mock-free test:** if the domain follows the dependency rule, most unit
  tests need no mocks at all.

## How to apply

In plan-writer, decide the test level per component (domain → unit; adapter → integration;
flow → 1-2 E2E). The test gate (`run-gates.sh`) runs the suite; this strategy decides what to
write. Enforcement of the TDD cycle is the discipline of the `test-driven-development` skill (REQUIRED).
