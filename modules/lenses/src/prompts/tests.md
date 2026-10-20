# Tests

- Trigger: changed tests, or changed behaviour
- Input: the hunks; the `tests` slice; the rules file
- Call: E

## Prompt

Find tests in the change that break a testing rule in the rules file, chiefly the rule on tests that
pass without the change they cover.

Look for a break of the rules file's rule on:

1. A test that would still pass if the change it covers were reverted, such as one that checks only
   its own stand-in, calls only a helper the change left alone, or compares only values it defined
   itself.
2. A changed behaviour with no test that exercises it.
3. Any other testing rule the rules file states.

Check each candidate:

1. Quote the rule from the rules file. A candidate with no rule to quote is not a finding.
2. Name the line you would revert and say why the test still passes.
3. For a missing test, state the behaviour as a case: the input and the expected result.

Do not report:

1. A test of a test helper or a stand-in that checks the helper's own values.
2. An `expect(...).rejects` or `.resolves` chain without `await`.
3. A rule the repo's lint config enforces.

Severity: P2.
