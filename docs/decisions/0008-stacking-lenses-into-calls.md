# 0008: Stacking lenses into calls

- Date: 2026-10-17
- Status: decided

noslop groups the fired lenses into at most 8 calls, by the input they share:

| Call | Lenses |
| --- | --- |
| A | Correctness; failure handling and observability; concurrency and data integrity |
| B | Security and input trust |
| C | Architecture and boundaries; naming, shape and comments |
| D | Cross-repo and platform limits; deploy and config |
| E | Intent; tests |
| F | Reuse |
| G | Instructions |
| H | Documentation |

A call fires when any of its lenses fires, and its prompt holds only the sections of the lenses that fired. Security runs alone. At Light, every fired lens goes into 1 call. At Deep, call A splits into its 3 lenses.

Each lens stays a separate unit: its own id, trigger, slice, prompt section and output schema. A section never refers to another lens's section. Every finding carries its lens id. The grouping is config, so moving a lens into its own call is a config change.

## Why

- Lenses that read the same input share one context, which costs less than a call each.
- Separate units keep each lens measurable, and let any lens leave its call when it needs focus.

## Alternatives

- **One call per lens.** It repeats the shared input in every call.
- **One call for every lens.** Each lens gets less attention, and nothing measures a lens on its own.

## Consequences

- The eval corpus sets the final groups: a stack that loses recall against its lenses run alone is split.
