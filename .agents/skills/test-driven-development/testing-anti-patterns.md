# Testing Anti-Patterns

**Load this reference when:** writing or changing tests, adding mocks, or tempted to add test-only methods to production code.

## Contents

- Overview — test real behavior, not mock behavior
- The Iron Laws — the three nevers
- Anti-Pattern 1: Testing Mock Behavior
- Anti-Pattern 2: Test-Only Methods in Production
- Anti-Pattern 3: Mocking Without Understanding
- Anti-Pattern 4: Incomplete Mocks
- Anti-Pattern 5: Tests as Afterthought
- TDD Prevents These Anti-Patterns
- Quick Reference — the detection table
- The Bottom Line

## Overview

Tests must verify real behavior, not mock behavior. Mocks are a means to isolate, not the thing being tested.

**Core principle:** Test what the code does, not what the mocks do.

**Following strict TDD prevents these anti-patterns.**

## The Iron Laws

```
1. NEVER test mock behavior
2. NEVER add test-only methods to production classes
3. NEVER mock without understanding dependencies
```

## Anti-Pattern 1: Testing Mock Behavior

**The violation:**
```typescript
// ❌ BAD: Testing that the mock exists
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
});
```

**Why this is wrong:**
- You're verifying the mock works, not that the component works
- Test passes when mock is present, fails when it's not
- Tells you nothing about real behavior

**The fix:**
```typescript
// ✅ GOOD: Test real component or don't mock it
test('renders sidebar', () => {
  render(<Page />);  // Don't mock sidebar
  expect(screen.getByRole('navigation')).toBeInTheDocument();
});
// OR if sidebar must be mocked for isolation:
// Don't assert on the mock - test Page's behavior with sidebar present
```

### Gate Function

```
BEFORE asserting on any mock element:
  Ask: "Am I testing real component behavior or just mock existence?"
  IF testing mock existence:
    STOP - Delete the assertion or unmock the component
  Test real behavior instead
```

## Anti-Pattern 2: Test-Only Methods in Production

**The violation:**
```typescript
// ❌ BAD: destroy() only used in tests
class Session {
  async destroy() {  // Looks like production API!
    await this._workspaceManager?.destroyWorkspace(this.id);
  }
}
// In tests
afterEach(() => session.destroy());
```

**Why this is wrong:**
- Production class polluted with test-only code
- Dangerous if accidentally called in production
- Violates YAGNI and separation of concerns

**The fix:**
```typescript
// ✅ GOOD: Test utilities handle test cleanup. Session has no destroy().
// In test-utils/
export async function cleanupSession(session: Session) {
  const workspace = session.getWorkspaceInfo();
  if (workspace) await workspaceManager.destroyWorkspace(workspace.id);
}
// In tests
afterEach(() => cleanupSession(session));
```

### Gate Function

```
BEFORE adding any method to production class:
  Ask: "Is this only used by tests?"
  IF yes: STOP - put it in test utilities instead
  Ask: "Does this class own this resource's lifecycle?"
  IF no: STOP - wrong class for this method
```

## Anti-Pattern 3: Mocking Without Understanding

**The violation:**
```typescript
// ❌ BAD: Mock prevents config write that test depends on!
test('detects duplicate server', () => {
  vi.mock('ToolCatalog', () => ({ discoverAndCacheTools: vi.fn().mockResolvedValue(undefined) }));
  await addServer(config);
  await addServer(config);  // Should throw - but won't!
});
```

**Why this is wrong:**
- Mocked method had a side effect the test depended on (writing config)
- Over-mocking to "be safe" breaks actual behavior
- Test passes for the wrong reason or fails mysteriously

**The fix:**
```typescript
// ✅ GOOD: Mock at correct level
test('detects duplicate server', () => {
  vi.mock('MCPServerManager'); // Just mock slow server startup
  await addServer(config);  // Config written
  await addServer(config);  // Duplicate detected ✓
});
```

### Gate Function

```
BEFORE mocking any method:
  1. "What side effects does the real method have?"
  2. "Does this test depend on any of those side effects?"
  3. "Do I fully understand what this test needs?"
  IF depends on side effects: mock at a lower level, not the method the test depends on
  IF unsure: run the test with the real implementation FIRST, observe what it needs, THEN mock minimally
  Red flags: "I'll mock this to be safe", "this might be slow, better mock it"
```

## Anti-Pattern 4: Incomplete Mocks

**The violation:**
```typescript
// ❌ BAD: Partial mock - only fields you think you need
const mockResponse = { status: 'success', data: { userId: '123', name: 'Alice' } };
// Later: breaks when code accesses response.metadata.requestId
```

**Why this is wrong:**
- Partial mocks hide structural assumptions; downstream code may depend on fields you didn't include
- Tests pass but integration fails — false confidence

**The Iron Rule:** Mock the COMPLETE data structure as it exists in reality, not just the fields your immediate test uses.

**The fix:**
```typescript
// ✅ GOOD: Mirror real API completeness
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' },
  metadata: { requestId: 'req-789', timestamp: 1234567890 }
};
```

## Anti-Pattern 5: Tests as Afterthought

**The violation:**
```
✅ Implementation complete
❌ No tests written
"Ready for testing"
```

**Why this is wrong:** Testing is part of implementation, not an optional follow-up. TDD would have caught this. You can't claim complete without tests.

**The fix:** TDD cycle — write failing test → implement to pass → refactor → THEN claim complete.

## TDD Prevents These Anti-Patterns

1. **Write test first** → forces you to think about what you're actually testing
2. **Watch it fail** → confirms the test tests real behavior, not mocks
3. **Minimal implementation** → no test-only methods creep in
4. **Real dependencies** → you see what the test actually needs before mocking

**If you're testing mock behavior, you violated TDD** — you added mocks without watching the test fail against real code first.

## Quick Reference

| Anti-Pattern | Fix |
|--------------|-----|
| Assert on mock elements | Test real component or unmock it |
| Test-only methods in production | Move to test utilities |
| Mock without understanding | Understand dependencies first, mock minimally |
| Incomplete mocks | Mirror real API completely |
| Tests as afterthought | TDD - tests first |
| Over-complex mocks | Consider integration tests |

## The Bottom Line

**Mocks are tools to isolate, not things to test.** If TDD reveals you're testing mock behavior, you've gone wrong. Fix: test real behavior, or question why you're mocking at all.
