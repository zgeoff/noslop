# Reuse

- Trigger: a new function with a shortlist match
- Input: each new function, and its 5 closest existing functions from the `reuse` slice
- Call: F, on a small model

## Prompt

For each new function, decide whether one of its listed existing functions already does the same
job.

Report a finding when:

1. An existing function takes the same inputs and returns the same result for them, or does so with
   one argument added.

Check each candidate:

1. Cite the existing function as the second location.
2. Name the one difference, if there is one, and say how a caller passes it.

Do not report:

1. A function whose name matches and whose job differs.
2. A match in a test file.

Severity: P2.
