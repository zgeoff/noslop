# 0010: The reviewer config

- Date: 2026-10-17
- Status: decided
- Updated: 2026-10-19

A repo's noslop config is `review.json`. With no `review.json`, noslop runs built-in defaults: every
generic lens, the shared risk classes, no rules file, and the Codex adapter.

A `review.json` can name a parent with `extends`, such as
`"extends": "github:<owner>/noslop-config"`. With no `extends`, its parent is the built-in defaults.
Merging follows 3 rules:

1. Objects merge by key.
2. Arrays replace. One exception: `rules` entries append to the inherited ones, and an entry for an
   inherited path replaces that entry.
3. `null` removes an inherited key.

A review reads its config and rules files from the commit its change starts from, never from the
change itself. `noslop config` reads the working tree, so a config change can be tried before it
lands.

The config holds:

- **Risk classes:** each a name, path globs or a detector, and the lenses it forces on.
- **Stack patterns:** what counts as a write, an I/O import or a procedure in this stack, as call
  names and import sources.
- **Rules files:** one Markdown file of taste rules, or a list of them, such as a repo's skills.
  Each file and each of its references is one rule and loads whole. A taste finding cites its rule
  by an exact quote, which Assemble finds in the file. An entry's references load only for a change
  that touches the paths they name, and a `repo:` path names a file in the reviewed repo.
- **Model and effort per lens,** which override the depth's default.
- **The call grouping,** under [0008](0008-stacking-lenses-into-calls.md).

## Why

- A parent named in the file shows where every setting comes from.
- A pull request must not weaken its own review, so its edit to the config applies only after it
  merges.
- Fixed merge rules make the result of a merge predictable.
- Rules are taste that each layer adds to, so a repo that adds one project skill keeps the shared
  ones. Every other array is a list a repo owns whole.
- A skill's headings were written for agents, not as a contract with noslop, so a renamed heading
  must not turn a section into a rule. A quote ties a finding to words the file holds.
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
- 2026-10-18: each rules file loads whole, with no split by heading and no skip list, and a taste
  finding cites its file by a quote that Assemble checks. `rules` appends across `extends`, so the
  shared config saves each repo restating the shared skills. A `skip` list loads with a warning
  until the configs drop it.
- 2026-10-18: with no adapter in the config, noslop runs the Codex adapter. noslop does not look for
  which model CLIs are installed, so the same config runs the same adapter on every machine.
- 2026-10-18: a review reads its config from the base commit, so a pull request cannot weaken its
  own review, and `noslop config` reads the working tree for local trials.
- 2026-10-19: a rules file entry that lists `skip` fails the load, since every config has dropped
  the list, so the schema holds no key that the load ignores.
