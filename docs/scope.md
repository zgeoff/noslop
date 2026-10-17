# Scope

noslop's scope is a set of requirements in 3 tiers and a list of non-goals. A requirement links the
decision record that settles it.

| Tier | Meaning                                                                           |
| ---- | --------------------------------------------------------------------------------- |
| 1    | noslop is unusable without it. You start using noslop once tier 1 lands.          |
| 2    | noslop reviews a whole fleet with it: every lens, the merge gate and measurement. |
| 3    | An extension.                                                                     |

## Tier 1

| Requirement                                           | Decisions                                                                                           |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The static stage, with its slices and direct findings | [0002](decisions/0002-the-pipeline.md)                                                              |
| The correctness and security lenses                   | [0005](decisions/0005-the-lens-set.md)                                                              |
| The Codex adapter, configured read-only               | [0011](decisions/0011-model-adapters.md)                                                            |
| A local CLI with versioned JSON output                | [0011](decisions/0011-model-adapters.md)                                                            |
| Findings with anchors, severity and verdicts          | [0003](decisions/0003-what-counts-as-a-finding.md), [0004](decisions/0004-severity-and-verdicts.md) |
| Built-in defaults, so a repo needs no config          | [0010](decisions/0010-the-reviewer-config.md)                                                       |

## Tier 2

| Requirement                                                                                       | Decisions                                                                 |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Every lens, with routing by trigger                                                               | [0005](decisions/0005-the-lens-set.md), [0006](decisions/0006-routing.md) |
| Light, Standard and Deep, picked by a risk score                                                  | [0007](decisions/0007-depth-and-models.md)                                |
| Lenses grouped into calls by config                                                               | [0008](decisions/0008-stacking-lenses-into-calls.md)                      |
| `review.json` with `extends`, stack patterns, a rules file and effort per lens                    | [0010](decisions/0010-the-reviewer-config.md)                             |
| A Claude adapter                                                                                  | [0011](decisions/0011-model-adapters.md)                                  |
| The GitHub App: inline comments, a required check run, typed dispositions, re-review of the delta | [0009](decisions/0009-the-merge-loop.md)                                  |
| The findings store, read by other tools                                                           | [0012](decisions/0012-the-findings-store.md)                              |
| The eval harness, which replays a labelled corpus                                                 | [0012](decisions/0012-the-findings-store.md)                              |

## Tier 3

- A plugin API for detector code that stack patterns cannot express.
- A performance lens, once measurement shows a need.
- Mutation testing scoped to the diff, run in CI.

## Non-goals

- Running lint. Lint runs in the repo's own checks.
- Running tests or reproducers. The reviewer only reads.
- Writing fixes. The author fixes each finding.
- Shipping a rule set. Each user brings their own.
