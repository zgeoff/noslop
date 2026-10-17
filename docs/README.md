# noslop documentation

What noslop is, what binds it, and what has been decided.

## Start here

- [Overview](overview.md): what noslop does, how a review runs, and where your rules live
- [Principles](principles.md): the rules every review holds to, each with a test
- [Scope](scope.md): requirements in tiers, and non-goals
- [Glossary](glossary.md): the terms the docs and the code use, one meaning each

`decisions/` holds the decision records. `design/v1/` holds the design for the first build.
`architecture/` holds what is built.

## Decisions

Each record states its decision as it stands, with its reasons and the alternatives it rejected. The
numbers are stable IDs in the order the decisions were made.

- [0001: Scope and your own rules](decisions/0001-scope-and-your-own-rules.md): a reviewer for
  agent-written code that needs little config, with no rule set of its own
- [0002: The pipeline](decisions/0002-the-pipeline.md): lint first, outside noslop, then one static
  stage, then lenses
- [0003: What counts as a finding](decisions/0003-what-counts-as-a-finding.md): reach with a cited
  location, exposed defects only, anchors, named taste rules
- [0004: Severity and verdicts](decisions/0004-severity-and-verdicts.md): P1 to P3 by named
  criteria, CONFIRMED and PLAUSIBLE
- [0005: The lens set](decisions/0005-the-lens-set.md): 13 lenses, one concern each
- [0006: Routing](decisions/0006-routing.md): correctness always, every other lens on its trigger
- [0007: Depth and models](decisions/0007-depth-and-models.md): Light, Standard and Deep by a risk
  score, effort by depth
- [0008: Stacking lenses into calls](decisions/0008-stacking-lenses-into-calls.md): 8 calls, each
  lens a separate unit, grouping as config
- [0009: The merge loop](decisions/0009-the-merge-loop.md): inline comments, a required check, typed
  dispositions, the pull request fixes what it wrote
- [0010: The reviewer config](decisions/0010-the-reviewer-config.md): `review.json`, built-in
  defaults, `extends` and merge rules
- [0011: Model adapters](decisions/0011-model-adapters.md): each model CLI behind a read-only
  adapter, a versioned CLI with JSON output
- [0012: The findings store](decisions/0012-the-findings-store.md): one store, measures per lens,
  the eval harness
- [0013: Prompt language](decisions/0013-prompt-language.md): short numbered rules in plain words
- [0014: The code layout](decisions/0014-the-code-layout.md): `apps/`, `modules/`, `adapters/`,
- [0015: Reporters and disposition sources](decisions/0015-reporters.md): one result, a list of
  reporters out, dispositions back in
- [0016: The stack](decisions/0016-the-stack.md): gunshi, zod, ts-pattern, tiny-invariant, LogTape,
  oxc-parser, Kysely, Elysia, Octokit `libs/`, boundaries by tag
