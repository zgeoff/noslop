# Calls

A call is one model request that bundles one or more fired lenses. Routing groups the lenses that
[routing and depth](./routing-and-depth.md) fired into calls by the config's call grouping, and each
call runs once on the whole change, so its lenses see every hunk they read. A call's effort, model
and timeout come from its lenses and its depth.
[0008](../../decisions/0008-stacking-lenses-into-calls.md) records the default grouping and why each
lens stays a separate unit inside a call. [Lenses](./lenses.md) covers how a call's prompt is built
and how each finding keeps its lens.

## Grouping the fired lenses

The config maps each call ID to its lens list, and the built-in defaults hold the grouping of 0008.
A repo's `calls` key replaces the list of each call it holds, because arrays replace under the merge
rules in [the reviewer config](../config/review-config.md), so moving a lens into a call of its own
is a config change.

Routing walks the calls in the order of their IDs and puts each fired lens into the first call that
lists it. A call holds only the lenses of its list that fired, and a call with no fired lens is left
out. A fired lens that no call lists runs in a call of its own, so a grouping that leaves a lens out
never drops it. That call takes the lens's name as its ID, so the config load refuses a call that
takes a lens's name without listing that lens, because the two calls would share one ID.

At Light, every fired lens goes into one call, because a Light change is small enough for one prompt
to hold. At Standard and Deep, the calls follow the grouping, one call per group that fired, so a
review makes as few calls as its fired groups allow.

One call runs on one model. A lens whose config sets a model of its own therefore leaves its call
for a call with the other lenses that set the same model.

## Effort, model and timeout

A lens can set its own effort, model and timeout in the config, and the call takes its settings from
its lenses:

- The effort is the highest that any of its lenses asks for. A lens that sets none asks for the
  depth's effort.
- The model is the one its lenses set. When they set none, the adapter's model from the config
  applies, and then the CLI's own default.
- The timeout is the longest that any of its lenses sets. When none sets one, the adapter's timeout
  applies.

[Adapters](./adapters.md) covers how the adapter applies the model and the timeout and maps the
effort onto its CLI.

## Fitting a call to the input limit

A model CLI refuses an input past its own length limit, so a call's prompt has to fit under the
config's prompt limit before it is sent. The review builds each call's prompt in three steps:

1. A changed file that matches the config's data globs goes into no call. Corpora, fixtures and
   other generated data change in bulk, and a lens reads no defect in them line by line.
2. A changed file whose input passes the config's file limit goes into the call's left-out list. The
   input counts the file's hunks and its slice items, because both go into the prompt.
3. A call whose prompt still passes the prompt limit splits by file into parts. The parts keep the
   files in order and each part's prompt fits the limit. A file that overflows a part on its own
   goes into no part.

Each part runs as a call of its own, with its own record, retry and failure. The first part keeps
the call's ID. Each later part takes the ID with a part number after it, and a count follows when
another call of the review holds that ID, so every call record of a review has its own ID. A part
holds the call's lenses and the slice items on its own files, so a lens in one part never sees the
hunks of another part. When every file of a call overflows a part on its own, the call runs no part.

Each prompt names every changed file of its call that it leaves out, with the reason: a data file,
too large, or read by another call. A lens therefore never reports those hunks as missing. The fit
measures each part with that list at its longest, so the list never pushes a part past the limit.
When the input around the files overflows alone, such as a pull request body over the limit, the
call runs whole and its failure shows in the review.

A file that a call leaves out can still be in another call, because each call reads the hunks and
slices of its own lenses. The result's not-reviewed list holds each file that no call reads, with
its reason. [The CLI](../output/cli.md) and [the GitHub App](../output/github-app.md) show the list,
so a reader sees what the review did not cover. The result also lists each file that one call reads
while the calls of other lenses leave it out, with those lenses.
