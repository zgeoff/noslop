# 0010: The reviewer config

- Date: 2026-10-17
- Status: decided

A repo's noslop config is `review.json`. With no `review.json`, noslop runs built-in defaults: every generic lens, the shared risk classes, no rules file, and the first installed adapter.

A `review.json` can name a parent with `extends`, such as `"extends": "github:<owner>/noslop-config"`. With no `extends`, its parent is the built-in defaults. Merging follows 3 rules:

1. Objects merge by key.
2. Arrays replace.
3. `null` removes an inherited key.

The config holds:

- **Risk classes:** each a name, path globs or a detector, and the lenses it forces on.
- **Stack patterns:** what counts as a write, an I/O import or a procedure in this stack, as call names and import sources.
- **A rules file:** a Markdown file of named taste rules.
- **Model and effort per lens,** which override the depth's default.
- **The call grouping,** under [0008](0008-stacking-lenses-into-calls.md).

## Why

- A parent named in the file shows where every setting comes from.
- Fixed merge rules make the result of a merge predictable.
- Risk classes in config, with the lenses they force, make one mechanism serve both depth and routing.

## Alternatives

- **Find the parent config by a naming convention.** A setting's source is not visible in the file.
- **Detector plugins in code.** Stack patterns cover the detectors so far, and a plugin API is tier 3.

## Consequences

- A call runs at the highest effort that its fired lenses ask for. Lenses that ask for different models split into separate calls.
