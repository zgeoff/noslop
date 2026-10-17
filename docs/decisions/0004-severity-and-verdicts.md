# 0004: Severity and verdicts

- Date: 2026-10-17
- Status: decided

A finding has one of 3 severities, and the lens names the criterion it applies:

| Severity | Criteria |
| --- | --- |
| P1 | A security defect; data loss, corruption, or an outcome that cannot be undone; an outage, or a broken deploy or release, including a version a consumer's pin refuses; a wrong result on the main path |
| P2 | Wrong behaviour on an edge or failure path; a changed behaviour with no test; a broken taste rule |
| P3 | Naming, comments, documentation prose |

A finding is CONFIRMED when a lens checked its mechanism in the code, and PLAUSIBLE when it rests on a fact the lens could not read, such as live state. A PLAUSIBLE finding holds that fact. A PLAUSIBLE P1 counts as a P1 until someone checks the fact. A lens lowers a severity only on a fact it checked.

## Why

- Named criteria make severity a rule, not a judgement, so 2 runs agree.
- A verdict says how far to trust a finding, and the fact it holds is what to check.
- Rating the unsafe case keeps an unchecked risk from passing as a low one.

## Alternatives

- **A 4-level scale with a top "drop everything" level.** The top level adds a judgement call that the P1 criteria cover.
- **A numeric confidence score.** A number gives no action. A verdict with a named fact does.
- **Severity from blast radius and reversibility.** Both are judgements, and 2 runs can rate them differently.

## Consequences

- Severity orders the work, sets the step up to Deep, and sets blocking for code the pull request did not write.
- Severity never decides whether a finding may be deferred, under [0009](0009-the-merge-loop.md).
