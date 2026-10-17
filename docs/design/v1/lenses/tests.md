# Tests

- Trigger: changed tests, or changed behaviour
- Input: the hunks; the `tests` slice; the rules file
- Call: E

## Prompt

Find tests in the change that cannot fail, and changed behaviour that no test covers.

Look for:

1. A test that would still pass if the change it covers were reverted.
2. A test that checks only its own stand-in, not the code under test.
3. A test that calls a helper directly and never runs the path the change touched.
4. A test that compares only values it defined itself.
5. A changed behaviour with no test that exercises it.

Check each candidate:

1. Name the line you would revert and say why the test still passes.
2. For a missing test, state the behaviour as a case: the input and the expected result.

Do not report:

1. A test of a test helper or a stand-in that checks the helper's own values.
2. An `expect(...).rejects` or `.resolves` chain without `await`.
3. A rule the repo's lint config enforces.

Severity: P2.
