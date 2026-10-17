# Pipeline

A review turns the change between two commits into a list of findings. It reads the change through
git, runs the static stage over it, routes the change to the lenses that fire, sends those lenses to
a model in calls, and assembles what comes back into findings. Every fact a model needs and code can
compute comes from the static stage first, under [0002](../decisions/0002-the-pipeline.md), so the
model calls spend their tokens on judgement. The review module runs these stages; the CLI and the
[GitHub App](./github-app.md) only supply the change and hand the result to
[reporters](./reporters.md).

```mermaid
flowchart LR
  load[Load] --> static[Static stage] --> route[Route] --> call[Call] --> assemble[Assemble] --> report[Report]
  assemble -. confirmed P1 at Standard .-> call
```

## The stages

1. **Load.** The CLI finds the repo, merges [the reviewer config](./review-config.md) and reads the
   rules file. It resolves the base and the head to full commits, and reads the diff between them
   with the files the config marks generated left out. Every line reference in the review cites the
   head commit.
2. **Static stage.** [The static stage](./static-stage.md) reads the changed files at the head,
   builds the slices, reports the direct findings and computes the risk signals. It runs on every
   change, because it makes no model call and routing reads its output even when no code changed.
3. **Route.** [Routing](./routing-and-depth.md) picks the lenses that fire, the depth, and the calls
   that carry them, from the static stage's output alone, so two runs on one change route it the
   same way.
4. **Call.** For each planned call, the [lenses](./lenses.md) build one prompt, and the
   [adapter](./adapters.md) sends it to a model CLI. The calls run at the same time, up to the
   config's parallel limit, and the review keeps their records and findings in the planned order,
   whatever order they end in. A call that fails is retried once on the same adapter. A call that
   fails again is recorded as failed, and the review goes on with the rest.
5. **Assemble.** The findings module turns the raw output of every call, with the static stage's
   direct findings, into [findings](./findings.md): it drops a finding that breaks the finding rules
   and merges two reports of one defect.
6. **Report.** The CLI prints the result, as JSON or as a summary, and runs each reporter the config
   lists, or the ones its flag names.

The calls read a detached git worktree of the head commit, so a model that opens a file sees the
reviewed code and never the user's working tree. The review creates the worktree only when the route
holds a call, and removes it whether the calls pass or fail. A worktree that git cannot remove is
logged for the user to prune.

## Depth passes

The depth that routing picks decides how many passes the Call and Assemble stages make. Light and
Standard make one pass. Deep makes a first pass, then a verify pass, and on a large change a gap
sweep, under [0007](../decisions/0007-depth-and-models.md).

A Standard review whose first pass holds a confirmed P1 steps up to Deep once: routing plans the
calls again at Deep, and the Deep passes run in full. The Deep findings replace the Standard ones,
because the Deep pass reads the same change more closely. The Standard calls stay in the result
under their own IDs, so their cost is still counted, and the result records the depth it stepped up
from.

The verify pass reruns each Deep call that reported a finding, with the earlier findings and a
closing task to re-derive each one from the code. Its findings replace that call's findings, so a
finding the model cannot trace a second time drops out. A call whose verify call fails keeps its own
findings, because a failed check is no evidence against a finding.

The gap sweep reruns every Deep call with all the findings so far and a task to report only what
they miss. It runs only on a change that is large by the config's file or line count, and only when
no blocking finding survives: a P1, a security finding, or a finding in a marked risk class. A
change that already blocks the merge gains nothing from more findings.

## The result

The review result holds the commits, the depth, the special route if any, the marked risk classes,
the fired lenses, a record of every call, the findings, the failed calls, and a hash of the merged
config and rules text. The record of each call holds its lenses, depth, model, effort, chunk,
attempts, tokens and duration, so the [findings store](./store.md) and the [eval harness](./eval.md)
can price a review and tell which call found what. The contract package holds the schema, and its
version changes only with a breaking change, so a consumer that pins a CLI version reads one shape.

A review with a failed call still returns a result, with the call listed under its failed calls. A
re-review of a pull request starts from the last head whose review had no failed call, because a
review with a failed call never covered its head in full. [The CLI](./cli.md) covers how a re-review
picks its base.
