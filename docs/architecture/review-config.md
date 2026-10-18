# The reviewer config

A repo's noslop config is `review.json` at the repo root, and every key in it is optional. The
config module starts from built-in defaults, merges each file of an `extends` chain over them, and
validates the merged result, so a review always reads a config with every key set. A repo with no
`review.json` still gets a review from the defaults, under
[0010](../decisions/0010-the-reviewer-config.md). The contract package (`@noslop/contract`) holds
the schema of the merged config. [Your own rules](./your-own-rules.md) covers the parts a user
brings: the rules file, stack patterns and risk classes.

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

The config module reads the repo's own `review.json` from the repo's working tree, then follows its
`extends` to the parent, and that parent's `extends` in turn, until a file names none. It then
merges the chain over the built-in defaults, from the root parent down to the repo's own file, so
the file nearest the repo wins. Three rules govern each merge:

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

The merged config is validated once, after the merge, because a single file is only a partial
config. A key the schema does not know fails the load, with the dotted path of the key, so a typo
never passes as an empty setting.

The `rules` value is one path, or a list whose entries are paths or objects with a `path` and a
`references` map. Each path resolves against the file that names it, as `extends` does, so a parent
in a shared config repo can name a rules file that sits beside it. A `repo:` path resolves against
the reviewed repo instead, so that parent can name a file each repo holds. The module reads each
file and each reference as one rule, whole. An entry may still hold a `skip` list: the load ignores
it and warns, in `noslop config` and in the review's log. [Your own rules](./your-own-rules.md)
covers how a review picks the rules that apply to its change.

## What a review records

The config module hashes the merged config together with the text of every rules file, and the
review result holds that hash. Two reviews with the same hash ran under the same settings and rules,
so the [findings store](./store.md) and the [eval harness](./eval.md) can compare their findings.
The module also keeps the source of every leaf key, as a path or a `github:` location, and
`noslop config` prints the merged config with the source of each key and the chain it came from.

## The built-in defaults

The defaults hold every generic lens, a default call grouping, the default thresholds, a generic set
of risk classes and stack patterns, and the path globs for generated, instruction, prose and infra
files. They turn the merge pass on, and give each adapter a cheap model for it. They name no rules
file, no adapter and no consumers, so a repo with no config gets a review that knows nothing about
its stack or its taste. The defaults hold no project names or stack-specific patterns, under
[0001](../decisions/0001-scope-and-your-own-rules.md). When neither the config nor the CLI flag
names an adapter, the CLI uses its own default adapter, which [adapters](./adapters.md) covers.

## Per-lens overrides

A lens override can turn a lens off, name a model for it, set its effort, or set its timeout. A lens
turned off stays off unless a marked risk class forces it on, because a risk class marks code a user
wants reviewed whatever else the config says. [Routing and depth](./routing-and-depth.md) covers how
the depth sets the default effort, and [calls](./calls.md) covers how an override's model and effort
shape the calls.

The other groups of keys belong to the parts that read them: the thresholds to
[routing and depth](./routing-and-depth.md), the call grouping to [calls](./calls.md), the adapter
options to [adapters](./adapters.md), the merge pass switch and effort to
[the pipeline](./pipeline.md), and the reporter list and options to [reporters](./reporters.md).
