# 0002: The pipeline

- Date: 2026-10-17
- Status: decided
- Updated: 2026-10-18

A review is one static stage followed by lenses, and a merge pass on their findings under
[0007](0007-depth-and-models.md). Lint is a precondition: it runs in the repo's own checks before
noslop, and noslop never runs it. The static stage parses the changed files once with oxc, runs
every analysis in one batch, and cuts the result into the slices each lens needs. It reports direct
findings with no model call. The stage runs on every change, because routing reads its output even
when the change holds no code.

## Why

- A fact that code can compute costs no model call and gives the same answer every run.
- One parse serves every lens, so adding a lens adds no parse.
- Lint enforces what it can, so a lens that repeats it adds noise.

## Alternatives

- **Run lint inside noslop.** It repeats the repo's own checks and couples noslop to each repo's
  lint setup.
- **A parse per lens.** Each lens pays for its own parse, and the slices can disagree.
- **Send the whole diff to every lens.** Every call pays for the whole diff, and a lens reads code
  outside its concern.

## Consequences

- Every lens trigger reads the slices, under [0006](0006-routing.md).
- A lens judges only what the stage cannot decide.

## Changes

- 2026-10-18: the static stage runs on every change, not only on a change that holds code, because
  routing reads its output to pick the special routes and the lenses.
- 2026-10-18: a merge pass on the findings follows the lenses, under
  [0007](0007-depth-and-models.md).
