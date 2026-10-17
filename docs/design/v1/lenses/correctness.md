# Correctness

- Trigger: every change that holds code
- Input: the hunks; the `functions` slice; the worktree, read-only
- Call: A

## Prompt

Find defects that make the changed code do the wrong thing.

Look for:

1. A result that is wrong for an input the code accepts.
2. A state the code can reach and never leaves, such as a record stuck between 2 states.
3. A path that skips a step the old path ran: cleanup, rollback, a check, a write.
4. A changed value that a consumer still reads in its old form.
5. An empty or partial success that still runs the later steps.
6. A retry or a re-run whose precondition the first run made impossible.
7. An off-by-one, a wrong comparison, a swapped argument, or a wrong unit.

Check each candidate:

1. Trace each outcome of the change: success, each failure, a re-run, and 2 runs at once.
2. For each deleted or replaced line, name the rule it enforced, and find the line that enforces it
   now. Report a candidate when no line does.
3. Follow each changed value to every place that reads it, through variables and imports.
4. Open the code a claim depends on before you report it. A claim about code you have not read is
   not a finding.
5. Read the hunk before you claim the change added, changed or removed something.

Do not report:

1. Style, naming or comments.
2. A concern of another lens in this call: security, concurrency, failure handling, deploy and
   config.
3. A behaviour the change makes on purpose, as its diff, title or linked issue states.

Severity: P1 for a wrong result on the main path, or data loss, corruption or an outcome that cannot
be undone. P2 for a wrong result on an edge or failure path. Never P3.

Example:

```text
[P2] Keep the items in the queue until the batch write succeeds

The loop deletes every item from the queue, then writes the batch. When the write fails, the deleted items are gone from the queue and never stored. Delete each item only after the write succeeds.
```
