# Your own rules

noslop ships no rule set, under [0001](../decisions/0001-scope-and-your-own-rules.md). The core
knows generic defects, and everything that is one codebase's taste or one stack's meaning comes from
the user's config. A user brings three things: a rules file for the taste lenses, stack patterns
that tell the static stage what the stack's calls mean, and risk classes that mark the paths a
review must take seriously. Each one lives in [the reviewer config](./review-config.md), so a shared
config repo can hand the same three to several repos.

## The rules file

The rules file is Markdown, named by the config's `rules` key, which names one file or a list of
them. Each level-2 or level-3 heading names one rule, and the lines up to the next such heading are
its body. A heading inside a code block is example text, so a rule can show a Markdown example
without splitting itself in two. Text before the first heading belongs to no rule.

```markdown
## Context goes last

1. A function that takes a context parameter takes it last: `fn(x, y, ctx)`.
2. A framework signature such as `(ctx, next)` is exempt.
```

A rule's name is its file's label, then a colon, then its heading, such as
`.claude/skills/testing/SKILL.md: Loops`. The label is the path as the config wrote it, so 2 files
in a list can each hold a rule under one heading. A list entry can skip headings, so a skill serves
as a rules file unchanged: its sections on how to load it, or its index of rules, hold no rule.

A list entry can name references: files beside it, each with the path globs it applies to. A
reference's rules reach a review only when the change touches a path that one of its globs matches,
so a rule for Nix files costs a TypeScript change nothing. A file's skip list applies to its
references too.

A path that starts with `repo:` resolves against the root of the reviewed repo, not the config file
that names it. A shared config in its own repo names the synced skills this way. Each repo syncs
only the skills and references it needs, so a `repo:` file or a reference that the repo lacks holds
no rule, and the load goes on. Any other rules file that does not exist fails the load. A `repo:`
path and a reference both stay inside the folder they resolve against.

```json
{
  "rules": [
    {
      "path": "repo:.claude/skills/testing/SKILL.md",
      "references": { "references/nixos.md": ["**/*.nix"] },
      "skip": ["Key rules", "References", "Loading the skill"]
    },
    "repo:.claude/skills/code-style/SKILL.md"
  ]
}
```

A call whose lenses read the rules file carries every rule that applies to the change, each under
its name, and [the lenses](./lenses.md) covers which lenses read it. A taste finding names one rule
by its full name, and Assemble drops a taste finding whose rule no file holds, as
[findings](./findings.md) describes. A repo with no rules file gets a prompt that tells the lenses
to report no taste finding, so the taste lenses still check generic concerns.

## Stack patterns

Stack patterns tell the static stage what a stack's code means, read from the syntax tree with no
code to load or run. Each pattern holds a list of call names and a list of import sources. A call
matches a call name in one of three ways:

- A name that starts with a dot, such as `.handler`, matches any callee that ends with it.
- A dotted name, such as `Bun.write`, matches that name at the end of any object chain.
- A bare name, such as `insertInto`, matches the last part of the callee.

A call also matches when the first part of its callee is a name imported from a listed source, so a
pattern can claim a whole module's calls.

| Pattern             | What a match feeds                                                           |
| ------------------- | ---------------------------------------------------------------------------- |
| `writes`            | The write slice, the concurrency trigger and the deletion detector           |
| `io`                | The I/O calls of each changed function, which the architecture trigger reads |
| `procedures`        | The request-path part of the security slice                                  |
| `transactionHelper` | The write slice: a write inside its callback counts as in a transaction      |
| `invariant`         | The guard slice: a call that asserts a condition only a bug breaks           |
| `events`            | The write slice's events beside each write, and the events slice             |
| `logger`            | Nothing: the static stage records the match, and no slice reads it           |

The built-in defaults hold generic patterns for the standard library and the runtime. A repo adds
its own stack's calls, such as its query builder's writes, by listing them; an array replaces the
inherited one, so the repo's list holds the defaults it keeps.

## Risk classes

A risk class is a name, path globs, detectors, and the lenses it forces on. The static stage marks a
class when a changed path matches one of its globs, or when one of its detectors fires. A detector
is a fact the static stage finds: a part of the security slice by its name, a changed migration, or
a deletion among the writes. The built-in defaults hold a generic set of classes, and a repo adds
its own beside them, or removes one with `null`. A class the repo adds names all three lists, with
an empty list where one does not apply, because the schema requires each one.

A marked class forces its lenses on, even a lens the config turns off, and makes the change Deep.
One exception: a sync, a release bump or a docs-only change runs its own narrow lens list, and a
class forces no lens onto it. A finding anchored in a marked class's paths carries the class's name.
[Routing and depth](./routing-and-depth.md) covers how a class changes the route, and
[findings](./findings.md) covers what the class on a finding does at the merge.
