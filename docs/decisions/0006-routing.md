# 0006: Routing

- Date: 2026-10-17
- Status: decided
- Updated: 2026-10-18

The correctness lens runs on every change that holds code. Every other lens runs only when its
trigger matches, and it receives only its own slice and hunks.

| Lens                               | Trigger                                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security and input trust           | Any of its slices: allow-or-deny checks, injection sinks fed by non-constant input, request-path middleware and headers, row-mapper columns, reads of credential paths |
| Concurrency and data integrity     | 2 or more writes, a write plus an event, or a migration                                                                                                                |
| Failure handling and observability | A new throw, catch or detached call                                                                                                                                    |
| Architecture and boundaries        | A function with cyclomatic complexity of 5 or more that does I/O, or a new interface                                                                                   |
| Cross-repo and platform limits     | A changed export, schema or pin that a consumer edge uses                                                                                                              |
| Deploy and config                  | An infra, workflow or container file, or a changed config read                                                                                                         |
| Reuse                              | A new function with a shortlist match                                                                                                                                  |
| Naming, shape and comments         | A new exported name, or comment density over the target                                                                                                                |
| Tests                              | Changed tests, or changed behaviour                                                                                                                                    |
| Intent                             | A linked issue                                                                                                                                                         |
| Instructions                       | A changed agent instruction file                                                                                                                                       |
| Documentation                      | 100 or more changed prose lines, or a new docs file                                                                                                                    |

A risk class in config can force a lens on for its paths. Some changes route differently:

- A sync change from a source repo gets only the synced-copy check. The source change carries the
  review.
- A release bump gets only the version checks.
- A docs-only change gets only the documentation and instructions lenses.

## Why

- A lens that cannot find anything in a change costs a call and adds noise.
- A trigger computed from slices is a rule, so 2 runs fire the same lenses.

## Alternatives

- **Every lens on every change.** It pays for every lens on every change, most of them with nothing
  to find.
- **A model picks the lenses.** It costs a call and can pick differently on the same change.

## Consequences

- Each threshold is a default that the config sets, under [0010](0010-the-reviewer-config.md).

## Changes

- 2026-10-18: a direct push routes by the triggers and its result marks it as a direct push. Filing
  its findings as issues is no part of routing.
- 2026-10-18: dropped the direct-push line. A direct push routes by the triggers like any other
  change, so routing holds no rule for it.
