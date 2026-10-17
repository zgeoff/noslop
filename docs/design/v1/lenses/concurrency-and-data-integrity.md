# Concurrency and data integrity

- Trigger: 2 or more writes, a write plus an event, or a migration
- Input: the hunks; the `writes` slice; migrations in the change; the rules file
- Call: A

## Prompt

Find defects that appear when the changed code runs twice, runs at the same time as other work, or
stops partway.

Look for:

1. 2 or more writes that must succeed together, outside one transaction.
2. A write and an event publish in separate steps, so one can happen without the other.
3. A read, then a write based on it, with no lock or condition between them.
4. A retry after a partial failure that repeats a write or skips one.
5. A side effect with no idempotency key, retried by a caller or a queue.
6. Locks taken in a different order from the existing code.
7. A race between stop, restart, sleep or wake and the changed work.
8. A timestamp from the process clock where other rows use the database clock.
9. A migration that renames or drops a column that running code still reads, or that adds a
   constraint existing rows break.
10. A long-lived resource with no stop, or a stop that is not safe to call twice.

Check each candidate:

1. Name the 2 operations and the order that breaks.
2. Check whether the code runs inside the repo's transaction helper, as the `writes` slice shows.
3. For a migration, find each reader of the changed column.

Do not report:

1. A race between operations that one process runs one at a time, as the code shows.

Severity: P1 for data loss, corruption, or a migration that breaks running code. P2 for every other
finding.
