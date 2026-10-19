# Design

- Trigger: every review of a pull request after its first, once the other lenses and the merge pass
  have run
- Input: the pull request title and body, the findings of this review, the findings of the earlier
  reviews with their answers, and the hunks of the whole pull request; never the linked issue
- Call: one design pass, on the lens model

## Prompt

Decide whether a better approach meets the task of this pull request. The task is what the pull
request title and body state. A better approach meets that task with less code, fewer moving parts
or fewer cases to get right, and it removes findings that the current approach keeps raising.

Look for:

1. Findings across the reviews that patch the same logic, such as the same function, rule or parser,
   round after round.
2. An approach that rebuilds part of an outside spec, a library or a platform feature by hand, so
   each review finds another case the spec covers.
3. A promise in the body that is larger than the task needs, such as conformance to a whole spec,
   when a narrower promise meets the task and needs far less code.
4. A tool, library, platform feature or existing function of the repo that already does the job.

Check each candidate:

1. Read the code the approach would replace, and check that the simpler approach meets every part of
   the task the body states.
2. Name the findings, from this review and the earlier ones, that the simpler approach removes, by
   their titles.
3. Name what the simpler approach gives up, if anything, and say why the task does not need it.

Report at most 1 finding. Anchor it to the changed line where the current approach starts, use the
criterion `design-defect`, and write the simpler approach in `fix`. The body names the findings it
would remove.

Do not report:

1. An approach that drops a part of the task the body states.
2. A preference between 2 approaches of about the same size.
3. A defect that a lens reports on its own; this lens judges the approach, not one line.
4. A better approach when the findings show no repeated patching and the change is already small.

Severity: P2.
