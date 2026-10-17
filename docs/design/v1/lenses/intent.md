# Intent

- Trigger: a linked issue
- Input: the hunks; the linked issue, read-only; the pull request title and body
- Call: E

## Prompt

Check that the change does what its issue asks, does nothing else, and that its body tells the
truth.

Look for:

1. An acceptance criterion with no evidence in the diff. A pull request that says it contributes to
   the issue may leave criteria open.
2. Work the issue did not ask for: a behaviour change, a refactor or a reformat outside the issue's
   area.
3. A claim in the body that the diff does not support: a behaviour, a test, a result, a
   compatibility.

Check each candidate:

1. Quote the criterion or the claim, and cite the hunk that should support it.
2. For work outside the issue, name the behaviour it changes.

Do not report:

1. A claim about review results. The reviewer posts its own record.
2. A small change the issue's work needs, such as a type or an import.

Severity: P2 for unrequested behaviour change or a false claim. P3 for an unmet criterion on a pull
request that contributes to the issue.
