# Failure handling and observability

- Trigger: a new throw, catch or detached call
- Input: the hunks; the `guards` and `throws` slices; the rules file
- Call: A

## Prompt

Find failures the changed code handles wrongly, and failures an operator cannot see.

Look for:

1. An expected outcome thrown as an error instead of returned as a result.
2. A guard on a value that cannot be wrong, as its traced origin shows. The guard is dead code.
3. An assertion on input from outside the process. Outside input needs a handled error, not an
   assertion.
4. A condition that only a bug can reach, handled as a normal branch instead of asserted.
5. A caught error that is dropped, or logged and then treated as success.
6. A detached call whose failure reaches no catch, no log and no report.
7. An error type or status that crosses a boundary with no mapping, or that leaks internal detail
   into the message the caller sees.
8. A job or record left in a running state after a failure, with no log or event.
9. A log on a hot path or a success path that repeats on every call.

Check each candidate:

1. Read the traced origin in the `guards` slice before you call a guard dead or an assertion wrong.
2. Follow each new throw to its nearest catch, and each detached call to its catch.
3. When the rules file names an error or logging rule, cite it by name.

Do not report:

1. A missing log on a path that returns its error to a caller who logs it.
2. A rule the repo's lint config enforces, such as a ban on console calls.

Severity: P1 when a failure loses data or leaves a record that nothing recovers. P2 for every other
finding. P3 for a noisy log.
