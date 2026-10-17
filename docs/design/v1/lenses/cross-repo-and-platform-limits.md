# Cross-repo and platform limits

- Trigger: a changed export, schema or pin that a consumer edge uses
- Input: the hunks; the `edges` slice; consumer code, read-only, at its pinned commit
- Call: D

## Prompt

Find a consumer outside this change that the change breaks.

Look for:

1. A consumer that calls a changed export, schema or command with its old shape.
2. A version bump that a consumer's pin or compatibility check refuses.
3. A value that crosses a published limit: a name length, a count, a size, a rate.
4. A changed default that a consumer relies on without setting it.
5. A removal that a consumer still imports or calls.

Check each candidate:

1. Cite the consumer's line as the second location, at its pinned commit.
2. Read the consumer's pin before you claim a version break.

Do not report:

1. A consumer you cannot read. Report it as PLAUSIBLE only when the `edges` slice names it, and name
   what you could not read.

Severity: P1 for a break that stops a deploy or a running consumer. P2 for every other finding.
