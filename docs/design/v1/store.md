# The findings store

noslop owns the store of every review, finding and disposition.
[0012](../../decisions/0012-the-findings-store.md) records the decision. Other tools read it through
the CLI, and keep no copy.

## Tables

| Table          | One row per                                                                       |
| -------------- | --------------------------------------------------------------------------------- |
| `reviews`      | Review: repo, change, base, head, depth, config hash, start and end time          |
| `calls`        | Call: review, call ID, lenses, adapter, model, effort, tokens, duration, status   |
| `findings`     | Finding: review, call, every field in the [findings](findings.md) schema          |
| `dispositions` | Disposition: finding, kind, reason or commit or issue, author, time               |
| `escapes`      | Escape: the issue, the change that caused it, the lens that should have caught it |

## Measures per lens

- Yield: the share of findings with a `fixed` disposition.
- Noise: the share with `not-a-defect`.
- Recall: escapes on changes where the lens ran, against the findings it reported there.
- Cost and latency, from `calls`.

## Readers

`noslop store query <name> --json` runs one of a fixed set of named queries, such as `yield-by-lens`
or `open-findings`. A reader pins the CLI version and reads the same shape.
