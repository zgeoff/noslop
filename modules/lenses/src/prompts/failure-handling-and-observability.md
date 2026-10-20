# Failure handling and observability

- Trigger: a new throw, catch or detached call
- Input: the hunks; the `guards` and `throws` slices; the rules file
- Call: A

## Prompt

Find failures the changed code handles wrongly, and failures an operator cannot see.

Look for:

1. A caught error that is dropped, or logged and then treated as success.
2. A detached call whose failure reaches no catch, no log and no report.
3. An error type or status that crosses a boundary with no mapping, or that leaks internal detail
   into the message the caller sees.
4. A job or record left in a running state after a failure, with no log or event.
5. A break of the rules file's rule on errors and logs, such as how the code reports an expected
   outcome, which values it guards, what it asserts, and where it logs.

Check each candidate:

1. Read the traced origin in the `guards` slice before you call a guard dead or an assertion wrong.
2. Follow each new throw to its nearest catch, and each detached call to its catch.
3. For item 5, quote the rule from the rules file. A candidate with no rule to quote is not a
   finding.

Do not report:

1. A missing log on a path that returns its error to a caller who logs it.
2. A rule the repo's lint config enforces, such as a ban on console calls.

Severity: P1 when a failure loses data or leaves a record that nothing recovers. P2 for every other
finding. P3 for a noisy log.
