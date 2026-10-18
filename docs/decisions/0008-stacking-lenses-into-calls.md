# 0008: Stacking lenses into calls

- Date: 2026-10-17
- Status: decided
- Updated: 2026-10-18

noslop groups the fired lenses into calls by the input they share. The default grouping has 8
groups:

| Call | Lenses                                                                          |
| ---- | ------------------------------------------------------------------------------- |
| A    | Correctness; failure handling and observability; concurrency and data integrity |
| B    | Security and input trust                                                        |
| C    | Architecture and boundaries; naming, shape and comments                         |
| D    | Cross-repo and platform limits; deploy and config                               |
| E    | Intent; tests                                                                   |
| F    | Reuse                                                                           |
| G    | Instructions                                                                    |
| H    | Documentation                                                                   |

A call fires when any of its lenses fires, and its prompt holds only the sections of the lenses that
fired. Security runs alone. At Light, every fired lens goes into 1 call. At Standard and Deep, each
group that fired is 1 call. Every call reads the whole change, under
[0007](0007-depth-and-models.md).

One call runs on one model, so a lens that the config gives a model of its own leaves its group for
a call of its own. A fired lens that no group names runs in a call of its own. After the lens calls,
a review with 2 or more model findings makes 1 merge pass call on them, under 0007.

Each lens stays a separate unit: its own id, trigger, slice, prompt section and output schema. A
section never refers to another lens's section. Every finding carries its lens id. The grouping is
config, so moving a lens into its own call is a config change.

## Why

- Lenses that read the same input share one context, which costs less than a call each.
- Separate units keep each lens measurable, and let any lens leave its call when it needs focus.

## Alternatives

- **One call per lens.** It repeats the shared input in every call.
- **One call for every lens.** Each lens gets less attention, and nothing measures a lens on its
  own.

## Consequences

- A group that loses recall on the eval corpus against its lenses run alone is split, by a config
  change.

## Changes

- 2026-10-17: call A no longer splits into its lenses at Deep, so a review makes at most 1 call per
  fired group, and fewer calls win a tie.
- 2026-10-18: stated that a lens with a model of its own, or one no group names, runs in a call of
  its own, so 8 is the default count of groups and not a cap on the calls.
- 2026-10-18: a merge pass call on the findings follows the lens calls, and no verify or gap sweep
  call follows them.
