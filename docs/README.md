# noslop documentation

The guides take a user through a task, the runbooks take a contributor or maintainer through a
procedure, the architecture docs describe the code as it is built, and the decision records give
each choice with its reasons.

## Guides

- [Set up a repo](guides/set-up-a-repo.md): install noslop, review a branch, then review each pull
  request
- [Add your own rules](guides/add-your-own-rules.md): write a rules file, point `review.json` at it,
  and extend a shared config
- [Enforce a review with a relay](guides/enforce-a-review-with-a-relay.md): review on each
  developer's machine, post through your own relay, and gate the merge in CI
- [Answer a finding](guides/answer-a-finding.md): reply to a finding with a disposition, and how the
  check run follows

## Runbooks

- [Development](runbooks/development.md): contributor setup, the checks, and running the CLI from
  source
- [Running the eval](runbooks/running-the-eval.md): replay a labelled corpus and read its scores
- [Releasing](runbooks/releasing.md): the release steps the release workflow does not do

## Reference

- [review.schema.json](reference/review.schema.json): the JSON Schema of `review.json`, generated
  from the config schema

## Architecture

[The overview](architecture/overview.md) gives the whole review path, the areas, and what holds for
every part.

- Review
  - [Pipeline](architecture/review/pipeline.md): the stages from a change to a review result
  - [The static stage](architecture/review/static-stage.md): slices, direct findings and the risk
    signals
  - [Routing and depth](architecture/review/routing-and-depth.md): which lenses fire, and at which
    depth
  - [Calls](architecture/review/calls.md): how fired lenses group into model calls, with retry
  - [The lenses](architecture/review/lenses.md): one prompt per lens, and how a call's prompt is
    built
  - [Adapters](architecture/review/adapters.md): the Codex and Claude CLIs behind one read-only
    interface
  - [Findings](architecture/review/findings.md): the finding schema, anchors, severity, verdicts and
    the rules Assemble enforces
- Config
  - [The reviewer config](architecture/config/review-config.md): `review.json`, `extends`, merging
    and the built-in defaults
  - [Your own rules](architecture/config/your-own-rules.md): rules files, stack patterns and risk
    classes
- Output
  - [The CLI](architecture/output/cli.md): the `noslop` commands, their output and the npm package
  - [Reporters](architecture/output/reporters.md): where a result goes, and how dispositions come
    back
  - [The GitHub App](architecture/output/github-app.md): inline comments, the check run,
    dispositions and the App server
- Measurement
  - [The findings store](architecture/measurement/store.md): the SQLite store and its queries
  - [The eval harness](architecture/measurement/eval.md): the replay of a labelled corpus, scored
    per lens

## Decisions

Each record states its decision as it stands, with its reasons and the alternatives it rejected. A
changed decision is edited in place, and its `Changes` list gives each change. The numbers are
stable IDs in the order the decisions were made.

- [0001: Scope and your own rules](decisions/0001-scope-and-your-own-rules.md): a reviewer for
  agent-written code that needs little config, with no rule set of its own
- [0002: The pipeline](decisions/0002-the-pipeline.md): lint first, outside noslop, then one static
  stage, then lenses
- [0003: What counts as a finding](decisions/0003-what-counts-as-a-finding.md): reach with a cited
  location, exposed defects only, anchors, named taste rules
- [0004: Severity and verdicts](decisions/0004-severity-and-verdicts.md): P1 to P3 by named
  criteria, CONFIRMED and PLAUSIBLE
- [0005: The lens set](decisions/0005-the-lens-set.md): one lens per concern
- [0006: Routing](decisions/0006-routing.md): correctness always, every other lens on its trigger
- [0007: Depth and models](decisions/0007-depth-and-models.md): Light, Standard and Deep by the risk
  signals, effort by depth
- [0008: Stacking lenses into calls](decisions/0008-stacking-lenses-into-calls.md): each lens a
  separate unit, grouping as config
- [0009: The merge loop](decisions/0009-the-merge-loop.md): inline comments, a required check, typed
  dispositions, the pull request fixes what it wrote
- [0010: The reviewer config](decisions/0010-the-reviewer-config.md): `review.json`, built-in
  defaults, `extends` and merge rules
- [0011: Model adapters](decisions/0011-model-adapters.md): each model CLI behind a read-only
  adapter, one npm package with versioned JSON output
- [0012: The findings store](decisions/0012-the-findings-store.md): one store, measures per lens,
  the eval harness
- [0013: Prompt language](decisions/0013-prompt-language.md): short numbered rules in plain words
- [0014: The code layout](decisions/0014-the-code-layout.md): `apps/`, `modules/`, `adapters/`,
  `libs/`, boundaries by tag
- [0015: Reporters and disposition sources](decisions/0015-reporters.md): one result, a list of
  reporters out, dispositions back in
- [0016: The stack](decisions/0016-the-stack.md): the libraries noslop builds on
- [0017: Fix confirmation at the head](decisions/0017-fix-confirmation-at-the-head.md): pending; a
  fix judged at the head, a review keyed on the net change
