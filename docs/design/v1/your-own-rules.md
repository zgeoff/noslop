# Your own rules

noslop ships no rule set. A user brings 3 things in config, under
[0001](../../decisions/0001-scope-and-your-own-rules.md).

## The rules file

The rules file is Markdown. Each rule is a level-2 or level-3 heading that names the rule, followed
by the rule in short numbered lines and, where one helps, a good and a bad example.

```markdown
## Context goes last

1. A function that takes a context or deps parameter takes it last: `fn(x, y, ctx)` or
   `fn(opts, ctx)`.
2. A framework signature such as `(ctx, next)` is exempt.
```

The naming, shape and comments lens and the architecture and boundaries lens read the rules file.
Each taste finding cites a heading from it as `rule`. A patterns skill works as a rules file when
its rules follow this shape.

## Stack patterns

Stack patterns tell the static stage what a stack's code means. Each pattern is a list of call names
or import sources, matched against the syntax tree with no code to load:

| Pattern             | Feeds                                                       |
| ------------------- | ----------------------------------------------------------- |
| `writes`            | The concurrency and data integrity trigger; the write slice |
| `io`                | The I/O slice, the architecture trigger, the risk score     |
| `procedures`        | The access-gate slice of the security lens                  |
| `transactionHelper` | The write slice: writes inside it count as one transaction  |
| `logger`            | The failure handling slice                                  |
| `invariant`         | The guard slice: calls that assert a bug-only condition     |

## Risk classes

A risk class is a name, path globs or a built-in detector, and the lenses it forces on. A marked
class makes the change Deep, under [routing and depth](routing-and-depth.md). A repo adds its own
classes beside the built-in ones.
