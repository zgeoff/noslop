# Routing and depth

Routing decides, for one change, which lenses fire and how hard the review looks. It reads only what
the [static stage](./static-stage.md) produced: the changed files, the slices, the risk signals and
the config. No model takes part, so 2 runs on one change fire the same lenses at the same depth. The
triggers and the depth rules are black and white, like the severity criteria of
[findings](./findings.md) and the blocking rules of [the GitHub App](../output/github-app.md): code
applies each one without judgement, and a rule accepts some noise to stay consistent.
[0006](../../decisions/0006-routing.md) records the triggers and the special changes, and
[0007](../../decisions/0007-depth-and-models.md) records the Light and Deep rules. Routing then
plans the calls that carry the fired lenses, which [calls](./calls.md) covers.

## Special changes

A few kinds of change route on a lens list of their own in place of the triggers. Routing checks
them in order, so a change that is both a sync and a release routes as a sync, and each change gets
the narrowest route that covers it.

| Change      | When                                               | Lenses                         |
| ----------- | -------------------------------------------------- | ------------------------------ |
| sync        | every changed file is under a synced path          | none                           |
| release     | only changelogs and manifest version bumps change  | none                           |
| docs-only   | every changed file is prose or an instruction file | documentation and instructions |
| direct-push | the caller reviews a push to the default branch    | the triggers                   |

A sync or a release fires no lens, so its review holds only the static stage's findings, and the
review makes no worktree and runs no model. The source change of a sync carries its own review, and
a release bump changes no behaviour. A docs-only change fires the documentation lens on any prose it
changes, whatever its size, because documentation is the lens that change exists for. A direct push
fires lenses by the triggers like any other change, and the result marks it as a direct push.

## Firing a lens

A trigger is the rule that fires a lens, matched against the slices and the changed paths. The
correctness lens fires on every change that holds a code or test file. Each other lens fires when
its trigger matches, and each trigger reads only slices and changed paths, so a lens fires only when
its input holds something to look at. Several triggers compare a slice with a threshold from the
config, such as the number of writes that fires the concurrency lens.

A marked risk class fires every lens it forces on, whatever the triggers say.
[Your own rules](../config/your-own-rules.md) covers how a risk class is marked. A special change
with a lens list of its own ignores forced lenses, because its list is the whole route.

A lens that the config turns off never fires. One exception: a lens that a marked risk class forces
on fires even when the config turns it off, because the risk class is the stronger statement about
the change.

The fired lenses keep the lens set's own order, so a call's prompt holds its sections in one order
on every run.

## Picking the depth

Depth is how hard a review works: Light, Standard or Deep. The risk score is the set of rules below,
which reads the risk signals with no model and picks the depth. Routing checks Deep first, then
Light, and every other change is Standard. Depth sets the default effort of each call: low at Light,
medium at Standard and high at Deep. Every threshold comes from the config.

A change is Deep when any of these holds:

- A marked risk class has the configured number of changed lines or more in the class's own paths.
- It deletes the configured number of lines or more in the paths that risk classes force lenses on,
  whether or not the classes' detectors mark them, because a deletion there is the change most
  likely to break what a class protects.
- It touches the configured number of packages or more.
- It carries a breaking marker, or hits a consumer edge in another repo.

A risk class that a detector alone marks, or whose paths the change barely touches, leaves the
change at Standard. The class still fires the lenses it forces, so the change gets their review at
Standard effort.

A change is Light only when every one of these holds:

- No risk class is marked, and no static risk slice fires: no security slice, no migration, and no
  set of writes that would fire the concurrency lens.
- It changes no infra file, because an infra change deploys or provisions, and its effect reaches
  past what its line count shows.
- It touches no more packages than the Light limit allows, and no consumer edge.
- Its code lines are within the Light limit, or it changes only tests, or only prose and
  instructions.
- No file in it has a past escape.

The Light line limit is a high cutoff above which a change cannot be Light, not a test that only
small changes pass. The line count leaves out prose and instruction files, and the static stage
leaves generated files out of the change before routing reads it, so neither kind can push a change
past Light.

## The pass

The review module runs the planned calls in one pass at every depth, and the depth sets only the
effort of each call. A review never changes depth: a P1 that a Standard or Light review finds stays
in its result, and no call runs again. The [eval harness](../measurement/eval.md) counts the
labelled P1s and escapes that its Light cases hold, so a Light rule that lets P1s through shows up
on the corpus.

The pass runs every call through the adapter, retrying a failed call once, under
[adapters](./adapters.md). [Findings](./findings.md) covers how Assemble merges the findings of the
calls.
