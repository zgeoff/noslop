# Calls

A call bundles fired lenses into one model request.
[0008](../../decisions/0008-stacking-lenses-into-calls.md) records the grouping and why each lens
stays a separate unit.

## Default grouping

| Call | Lenses                                                                                |
| ---- | ------------------------------------------------------------------------------------- |
| A    | `correctness`, `failure-handling-and-observability`, `concurrency-and-data-integrity` |
| B    | `security`                                                                            |
| C    | `architecture-and-boundaries`, `naming-shape-and-comments`                            |
| D    | `cross-repo-and-platform-limits`, `deploy-and-config`                                 |
| E    | `intent`, `tests`                                                                     |
| F    | `reuse`                                                                               |
| G    | `instructions`                                                                        |
| H    | `documentation`                                                                       |

`calls` in the config replaces a call's lens list by call ID.

## Building a call's prompt

1. The shared header: the finding rules, the severity criteria, the verdict rules and the output
   schema.
2. One section per fired lens, in the grouping's order, each with its own rules.
3. The input: the hunks and slices that the fired lenses read, each slice once.

A lens section never refers to another lens's section. The output holds one findings list per lens,
keyed by lens ID, so every finding keeps its lens.
