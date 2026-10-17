# The static stage

The static stage parses the changed files once with oxc and builds every slice in one pass.
[0002](../../decisions/0002-the-pipeline.md) records the decision. The stage makes no model call.

## Inputs

- The changed files at the head commit, and their base versions.
- The base index: every exported function at the base commit, with its name tokens, its types, and a
  fingerprint of its literals, imports and calls. The index is cached per base commit.
- The stack patterns and risk classes from the config.
- Consumer manifests: `package.json` dependencies on the repo's own packages, and the pins and sync
  manifests that `consumers` in the config names.

## Slices

| Slice          | Holds                                                                                                                                               | Read by                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `functions`    | Each new or changed function: name, parameters, cyclomatic complexity, I/O calls, writes                                                            | Architecture, naming, reuse    |
| `reuse`        | For each new function, the 5 closest base functions                                                                                                 | Reuse                          |
| `guards`       | Each new guard, throw, early return and invariant call, with its condition's value traced 1 or 2 steps to its origin                                | Failure handling               |
| `throws`       | Each new throw with its type and nearest catch, and each detached call with its catch                                                               | Failure handling               |
| `writes`       | Each write, whether it sits in a transaction, and any event published beside it                                                                     | Concurrency and data integrity |
| `security`     | Allow-or-deny checks, injection sinks fed by non-constant input, request-path middleware and headers, row-mapper columns, reads of credential paths | Security                       |
| `edges`        | Changed exports, schemas and pins, with the consumers that use them                                                                                 | Cross-repo                     |
| `config`       | Changed infra, workflow and container files, and changed config reads                                                                               | Deploy and config              |
| `tests`        | Changed test files and the source files they cover                                                                                                  | Tests                          |
| `instructions` | Changed agent instruction files, and every file loaded beside them                                                                                  | Instructions                   |
| `prose`        | Changed prose files and their line counts                                                                                                           | Documentation                  |
| `comments`     | Comment lines per 1,000 changed lines, against the target                                                                                           | Naming                         |

## Direct findings

The stage reports these with no model call:

1. A test with no assertion.
2. 2 test bodies with the same fingerprint.
3. A type test that uses a key the type does not have.
4. A version bump that a consumer's pin or compatibility check refuses.
5. An input that feeds a published downstream limit with a schema bound above that limit.
6. A new allow-or-deny check with no hostile-input table in its tests.
7. An edit to a synced copy, not to its source.
8. The same rule sentence in 2 instruction files.
9. Vague wording in a new instruction rule: prefer, usually, where sensible, consider.
10. A format-only hunk in a file the linked issue does not cover.
11. A test that the pull request body names and the diff does not add.
12. A missing version bump where the repo's release rules need one.

## The risk score

The stage computes the signals that [routing and depth](routing-and-depth.md) reads: marked risk
classes, risk slices that fired, packages touched, consumer edges hit, changed and deleted lines, a
breaking marker in the title, and files with a past escape from the findings store.
