# 0004: Severity and verdicts

- Date: 2026-10-17
- Status: decided
- Updated: 2026-10-18

A finding has one of 3 severities, and the lens names the criterion it applies:

| Severity | Criteria                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1       | A security defect; data loss, corruption, or an outcome that cannot be undone; an outage, or a broken deploy or release, including a version a consumer's pin refuses; a wrong result on the main path |
| P2       | Wrong behaviour on an edge or failure path; a changed behaviour with no test; a broken taste rule                                                                                                      |
| P3       | Naming, comments, documentation prose                                                                                                                                                                  |

A lens names one criterion per finding, and the criterion sets the severity:

| Criterion                   | Severity | Covers                                                                     |
| --------------------------- | -------- | -------------------------------------------------------------------------- |
| `security-defect`           | P1       | A security defect                                                          |
| `data-loss`                 | P1       | Data loss, corruption, or an outcome that cannot be undone                 |
| `outage`                    | P1       | An outage, or a broken deploy or release, including a refused pin          |
| `wrong-result-main-path`    | P1       | A wrong result on the main path                                            |
| `wrong-behaviour-edge-path` | P2       | Wrong behaviour on an edge or failure path                                 |
| `untested-change`           | P2       | A changed behaviour with no test                                           |
| `taste-rule`                | P2       | A broken rule from the rules file                                          |
| `misleading-name`           | P2       | A name that hides what the code does                                       |
| `intent-mismatch`           | P2       | Unrequested work, an unmet acceptance criterion, a false claim in the body |
| `duplicate-helper`          | P2       | A new function that does the job of an existing one                        |
| `design-defect`             | P2       | Structure that makes the next change harder, with or without a rules file  |
| `instruction-conflict`      | P2       | An instruction that conflicts with another rule an agent loads             |
| `wrong-doc-fact`            | P2       | A wrong fact or a failing step in the documentation                        |
| `naming`                    | P3       | Naming                                                                     |
| `comments`                  | P3       | Comments                                                                   |
| `documentation-prose`       | P3       | Documentation prose                                                        |
| `noisy-log`                 | P3       | A log on a hot or success path that adds noise                             |

A taste finding is a finding with the `taste-rule` criterion.

A finding is CONFIRMED when a lens checked its mechanism in the code, and PLAUSIBLE when it rests on
a fact the lens could not read, such as live state. A PLAUSIBLE finding holds that fact. A PLAUSIBLE
P1 counts as a P1 until someone checks the fact. A lens lowers a severity only on a fact it checked.

## Why

- Named criteria make severity a rule, not a judgement, so 2 runs agree.
- A verdict says how far to trust a finding, and the fact it holds is what to check.
- Rating the unsafe case keeps an unchecked risk from passing as a low one.

## Alternatives

- **A 4-level scale with a top "drop everything" level.** The top level adds a judgement call that
  the P1 criteria cover.
- **A numeric confidence score.** A number gives no action. A verdict with a named fact does.
- **Severity from blast radius and reversibility.** Both are judgements, and 2 runs can rate them
  differently.

## Consequences

- Severity orders the work and sets blocking for code the pull request did not write.
- Severity never decides whether a finding may be deferred, under [0009](0009-the-merge-loop.md).

## Changes

- 2026-10-17: named the criteria, each with the severity it sets, so a finding's severity follows
  from its criterion.
- 2026-10-18: a P1 no longer steps a review up to Deep, since a review keeps the depth routing picks
  under [0007](0007-depth-and-models.md).
- 2026-10-18: added `design-defect` at P2, so the architecture lens reports its generic checks in a
  repo with no rules file. A finding under a rule keeps `taste-rule` and cites the rule.
