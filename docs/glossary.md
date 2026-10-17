# Glossary

These are the terms the docs and the code use. Each term means one thing.

## The pipeline

| Term | Meaning |
| --- | --- |
| static stage | The step that parses the changed files once, before any model call, and builds the slices and direct findings |
| slice | The part of the static stage's output that one lens needs, such as the new writes or the new throws |
| direct finding | A finding the static stage reports with no model call |
| lens | One review concern with its own trigger, slice, prompt section and output schema |
| trigger | The rule that fires a lens, matched against the slices and the changed paths |
| call | One model request that bundles one or more fired lenses |
| depth | How hard a review works: Light, Standard or Deep |
| risk score | The set of signals, computed with no model, that picks the depth |
| risk class | A named kind of risky change, such as auth or migrations, marked by a path glob or a detector |
| chunk | A group of hunks by file or package, sent to a lens when a diff passes 150 changed lines |

## Findings

| Term | Meaning |
| --- | --- |
| finding | A defect the change introduces or exposes, anchored to a line in the diff |
| anchor | The line in the diff that a finding attaches to |
| second location | Code outside the diff that a finding cites, at a pinned commit |
| severity | P1, P2 or P3, set by named criteria |
| verdict | CONFIRMED when checked against the code; PLAUSIBLE when it rests on a fact the reviewer could not read |
| disposition | The typed answer to a finding: `fixed`, `not-a-defect`, `deferred` or `accepted-risk` |
| re-review | A review of the commits since the reviewed head, which confirms each fix |
| reviewed head | The commit a review ran against |

## Config

| Term | Meaning |
| --- | --- |
| `review.json` | A repo's noslop config |
| `extends` | The `review.json` key that names a parent config, such as a shared config repo |
| built-in defaults | The config noslop uses when a repo has no `review.json` |
| rules file | A Markdown file of named taste rules that the config points to |
| stack pattern | A config entry that tells the static stage what counts as a write, an I/O call or a procedure in a stack |
| adapter | The package that runs a call on one model CLI, configured read-only |

## Measurement

| Term | Meaning |
| --- | --- |
| findings store | The store of every finding and its disposition, which noslop owns and other tools read |
| eval corpus | A labelled set of past changes, their findings and their escapes |
| escape | A defect found after merge in code that a review passed |
| baseline | The results of a reference reviewer on the eval corpus, which a lens must match or beat |
