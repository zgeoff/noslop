# 0010: The reviewer config

- Date: 2026-10-17
- Status: decided
- Updated: 2026-10-18

A repo's noslop config is `review.json`. With no `review.json`, noslop runs built-in defaults: every
generic lens, the shared risk classes, no rules file, and the first installed adapter.

A `review.json` can name a parent with `extends`, such as
`"extends": "github:<owner>/noslop-config"`. With no `extends`, its parent is the built-in defaults.
Merging follows 3 rules:

1. Objects merge by key.
2. Arrays replace.
3. `null` removes an inherited key.

The config holds:

- **Risk classes:** each a name, path globs or a detector, and the lenses it forces on.
- **Stack patterns:** what counts as a write, an I/O import or a procedure in this stack, as call
  names and import sources.
- **Rules files:** one Markdown file of named taste rules, or a list of them, such as a repo's
  skills. Each rule's name holds its file and its heading, and an entry can skip the headings that
  hold no rule. An entry's references load only for a change that touches the paths they name, and a
  `repo:` path names a file in the reviewed repo.
- **Model and effort per lens,** which override the depth's default.
- **The call grouping,** under [0008](0008-stacking-lenses-into-calls.md).

## Why

- A parent named in the file shows where every setting comes from.
- Fixed merge rules make the result of a merge predictable.
- Risk classes in config, with the lenses they force, make one mechanism serve both depth and
  routing.

## Alternatives

- **Find the parent config by a naming convention.** A setting's source is not visible in the file.
- **Detector plugins in code.** Stack patterns cover the detectors so far, and a plugin API is
  tier 3.

## Consequences

- A call runs at the highest effort that its fired lenses ask for. Lenses that ask for different
  models split into separate calls.

## Changes

- 2026-10-18: `rules` takes a list of files as well as one file, with a list of headings to skip for
  each, so a repo's skills serve as its rules unchanged. A rule's name holds its file, so 2 files
  can each hold a rule under one heading.
- 2026-10-18: a rules file names references that load only when the change touches their path globs,
  and a `repo:` path resolves against the reviewed repo, so one shared config can point every repo
  at its own synced skills.
