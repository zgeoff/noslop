# The eval harness

The harness replays a labelled corpus through a config, and reports per-lens results against a
baseline. A prompt, grouping or threshold change runs on it before it ships.

## The corpus

A corpus is a folder of cases. A case holds:

- The repo, the base and head commits of the change, and the reviewed head.
- Labelled findings: each with its anchor, its lens or category, and a label: `true-positive`,
  `false-positive` or `disputed`.
- Escapes: each with the defect, its location, and whether it was visible in the diff.

noslop ships a small synthetic corpus for its own tests. A user's real corpus lives outside the
repo.

## A run

1. For each case, the harness checks out the reviewed head read-only and runs
   `noslop review --json`.
2. It matches each reported finding to a labelled finding or an escape by anchor and defect.
3. It reports, per lens: true positives repeated, escapes caught, findings with no label, cost and
   latency.

## Gates

| Gate       | Passes when                                                     |
| ---------- | --------------------------------------------------------------- |
| Baseline   | A reference reviewer's run on the corpus is recorded            |
| Light rule | The Light cases hold about none of the corpus's P1s and escapes |
| Lens       | A lens matches or beats the baseline on its cases               |
| Stack      | A call's lenses keep their recall against each lens run alone   |
