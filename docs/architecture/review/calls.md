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
never drops it.

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
