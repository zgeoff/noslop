# The reviewer config

A repo's noslop config is `review.json` at the repo root, and every key in it is optional. The
config module starts from the built-in defaults, merges each file of an `extends` chain over them,
and validates the merged result, so a review always reads a config with every key set. noslop works
with no config: a repo with no `review.json` gets a review from the built-in defaults, under
[0010](../../decisions/0010-the-reviewer-config.md). The contract package (`@noslop/contract`) holds
the schema of the merged config, and the [generated JSON Schema](../../reference/review.schema.json)
describes each key. [Your own rules](./your-own-rules.md) covers the parts a user brings: the rules
file, stack patterns and risk classes.

```json
{
  "extends": "github:example/noslop-config",
  "rules": "./rules.md",
  "riskClasses": {
    "billing": { "paths": ["src/billing/**"], "detectors": [], "forces": ["security"] }
  },
  "lenses": { "reuse": { "enabled": false } },
  "synced": ["scripts/shared/**"]
}
```

## Resolution

`extends` is the key that names a parent config, such as a file in a shared config repo. The config
module reads the repo's own `review.json`, then follows its `extends` to the parent, and that
parent's `extends` in turn, until a file names none. It then merges the chain over the built-in
defaults, from the root parent down to the repo's own file, so the file nearest the repo wins. Three
rules govern each merge:

1. Objects merge by key, so a file that sets one risk class or one lens override keeps the inherited
   ones.
2. Arrays replace, so a file that lists paths owns the whole list. One exception: `rules` entries
   append to the inherited ones, because rules are taste that each layer adds to, while every other
   array is a list a repo owns. An entry whose resolved path matches an inherited entry replaces it,
   so a repo can change that file's references.
3. `null` removes an inherited key. A key the defaults leave null, such as the rules file, reads as
   none once a file removes it. A key the schema requires fails the load once a file removes it.

An `extends` value is a path relative to the file that names it, or
`github:<owner>/<repo>[/<path>][@<ref>]`, which names a file in another repo, `review.json` by
default, at a ref or at that repo's default branch. A remote parent's relative `extends` resolves
inside the same repo and ref. The CLI reads a remote file through GitHub, read-only, on every load.
A cycle in the chain fails the load, and so does a parent that does not exist. The repo's own file
is the only one that may be missing.

A review reads the repo's files of the chain and its rules from the commit its change starts from: a
pull request's base, or a local change's base. It never reads them from the change itself, because a
pull request must not weaken its own review. A pull request that edits `review.json` or a rules file
is reviewed under the config it would replace, and the edit applies to the reviews after it merges.
A remote parent and a rules repo outside the reviewed repo read as at any other load.
`noslop config` reads the working tree, so a config change can be tried out before it lands.

The merged config is validated once, after the merge, because a single file is only a partial
config. A key the schema does not know fails the load, with the dotted path of the key, so a typo
never passes as an empty setting.

The `rules` value is one path, or a list whose entries are paths or objects with a `path` and a
`references` map. Each path resolves against the file that names it, as `extends` does, so a parent
in a shared config repo can name a rules file that sits beside it. A `repo:` path resolves against
the reviewed repo instead, so that parent can name a file each repo holds. The module reads each
file and each reference as one rule, whole. [Your own rules](./your-own-rules.md) covers how a
review picks the rules that apply to its change.

## What a review records

The config module hashes the merged config together with the text of every rules file, and the
review result holds that hash. The hash takes each local rules path relative to the repo, so two
checkouts of one commit give one hash wherever each one sits. Two reviews with the same hash ran
under the same settings and rules, so the [findings store](../measurement/store.md) and the
[eval harness](../measurement/eval.md) can compare their findings. `noslop verify` compares a
result's hash with the hash of the config on the pull request's base branch, so a relay posts only a
review that ran under the config the repo enforces. The module also keeps the source of every leaf
key, as a path or a `github:` location, and `noslop config` prints the merged config with the source
of each key and the chain it came from.

## The built-in defaults

The built-in defaults are the config noslop starts every merge from, and the whole config of a repo
with no `review.json`. They hold every generic lens, a default call grouping, the default
thresholds, a generic set of risk classes and stack patterns, and the path globs for generated,
instruction, prose and infra files. They turn the merge pass and the design pass on, and give each
adapter a cheap model for the merge pass. They name no rules file, no adapter and no consumers, so a
repo with no config gets a review that knows nothing about its stack or its taste. The defaults hold
no project names or stack-specific patterns, under
[0001](../../decisions/0001-scope-and-your-own-rules.md). When neither the config nor the CLI flag
names an adapter, the CLI runs the Codex adapter, which [adapters](../review/adapters.md) covers. It
never looks for which model CLIs are installed, so one config runs one adapter on every machine.

## Per-lens overrides

A lens override can turn a lens off, name a model for it, set its effort, or set its timeout. A lens
turned off stays off unless a marked risk class forces it on, because a risk class marks code a user
wants reviewed whatever else the config says. [Routing and depth](../review/routing-and-depth.md)
covers how the depth sets the default effort, and [calls](../review/calls.md) covers how an
override's model and effort shape the calls.

The other groups of keys belong to the parts that read them: the thresholds to routing and depth,
the call grouping, the data globs and the prompt and file limits to calls, the adapter options to
adapters, the switch and effort of the merge pass and of the design pass to
[the pipeline](../review/pipeline.md), and the reporter list and options to
[reporters](../output/reporters.md).
