# Your own rules

noslop ships no rule set, under [0001](../../decisions/0001-scope-and-your-own-rules.md). The core
knows generic defects, and everything that is one codebase's taste or one stack's meaning comes from
the user's config. A user brings three things: a rules file for the taste lenses, stack patterns
that tell the static stage what the stack's calls mean, and risk classes that mark the paths a
review must take seriously. Each one lives in [the reviewer config](./review-config.md), so a shared
config repo can hand the same three to several repos.

## The rules file

A rules file is a Markdown file of taste rules, named by the config's `rules` key, which names one
file or a list of them. Each file reaches the taste lenses whole, under its label, the path as the
config wrote it. noslop reads no structure into it, so a repo's skills serve as its rules unchanged,
and a renamed heading changes nothing.

A taste finding names the file it rests on and quotes it, at least one full sentence, word for word.
Assemble looks for the quote in the file, with whitespace collapsed and case kept, and drops a
finding whose quote the file does not hold. The finding keeps the file's label and the nearest
level-2 or level-3 heading above the quote as its rule, such as
`.claude/skills/testing/SKILL.md: Loops`, so the store counts the yield of each section. A heading
inside a code block is example text and labels nothing.

A list entry can name references: files beside it, each with the path globs it applies to. A
reference reaches a review only when the change touches a path that one of its globs matches, so a
rule for Nix files costs a TypeScript change nothing.

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
      "references": { "references/nixos.md": ["**/*.nix"] }
    },
    "repo:.claude/skills/code-style/SKILL.md"
  ]
}
```

A call whose lenses read the rules file carries every file that applies to the change, each under
its label, and [the lenses](../review/lenses.md) covers which lenses read it.
[Findings](../review/findings.md) describes how Assemble checks a taste finding's quote. A repo with
no rules file gets a prompt that tells the lenses to report no taste finding, so the taste lenses
check only generic concerns.

## Stack patterns

A stack pattern is a config entry that tells the static stage what counts as one kind of code in a
stack, such as a write, an I/O call or a procedure, read from the syntax tree with no code to load
or run. Each pattern holds a list of call names and a list of import sources. A call matches a call
name in one of three ways:

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

A risk class is a named kind of risky change, such as auth or migrations. It holds path globs,
detectors, and the lenses it forces on. The static stage marks a class when a changed path matches
one of its globs, or when one of its detectors fires. A detector is a fact the static stage finds: a
part of the security slice by its name, a changed migration, or a deletion among the writes. The
built-in defaults hold a generic set of classes, and a repo adds its own beside them, or removes one
with `null`. A class the repo adds names all three lists, with an empty list where one does not
apply, because the schema requires each one.

A marked class forces its lenses on, even a lens the config turns off, and makes the change Deep.
One exception: a sync, a release bump or a docs-only change runs its own narrow lens list, and a
class forces no lens onto it. A finding anchored in a marked class's paths carries the class's name.
[Routing and depth](../review/routing-and-depth.md) covers how a class changes the route, and the
findings doc covers what the class on a finding does at the merge.
