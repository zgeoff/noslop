# Design v1

The design for noslop's first build. Each page states its contracts and links the decision records
it rests on. When a part lands, its page moves to `docs/architecture/`, rewritten to describe the
code.

## Build order

1. [Findings](findings.md) and [the reviewer config](review-config.md): the 2 contracts every other
   part reads.
2. [The static stage](static-stage.md): slices, direct findings and the risk score.
3. [Routing and depth](routing-and-depth.md) and [calls](calls.md): which lenses fire, how hard, and
   in which call.
4. [Adapters](adapters.md) and [the CLI](cli.md): a local review end to end.
5. [The lenses](lenses/README.md): one prompt per lens.
6. [The GitHub App](github-app.md) and [the findings store](store.md): the merge gate and its
   record.
7. [The eval harness](eval.md): the replay that gates every prompt change.

[Your own rules](your-own-rules.md) covers the rules file, stack patterns and risk classes that a
user brings.

## Pages

- [Pipeline](pipeline.md): the stages from a pull request to a check result
- [Findings](findings.md): the finding schema, anchors, severity and verdicts
- [The reviewer config](review-config.md): `review.json`, `extends`, merging and the built-in
  defaults
- [Your own rules](your-own-rules.md): the rules file, stack patterns and risk classes
- [The static stage](static-stage.md): parsing, slices, direct findings and consumer edges
- [Routing and depth](routing-and-depth.md): triggers, the risk score, Light, Standard and Deep
- [Calls](calls.md): which lenses each call bundles
- [Adapters](adapters.md): the adapter interface and the Codex and Claude adapters
- [The CLI](cli.md): commands, the JSON output and temp folders
- [The GitHub App](github-app.md): comments, the check run, dispositions and re-review
- [Reporters](reporters.md): the reporter and disposition-source interfaces, and the 4 reporters
- [The findings store](store.md): the schema and what a reader gets
- [The eval harness](eval.md): the corpus, the baseline and the gates
