# Overview

noslop reviews the pull requests that coding agents write. It runs after the repo's lint, computes
what code can compute in a static stage before any model call, and then sends each review concern,
called a lens, to the model CLI the user runs. It only reads: a review runs no tests and writes no
code. Every finding it posts on a pull request needs an answer before the pull request merges.

A repo needs no config to start, because built-in defaults run every generic lens. A `review.json`
adds the user's own rules, the patterns of their stack and their risk classes, and it can extend a
shared config repo.

## How a review runs

1. The static stage parses the changed files once and builds slices: the writes, I/O calls, throws,
   new functions and other facts that each lens needs. It reports direct findings that need no
   model.
2. Routing fires the correctness lens on every code change and every other lens on its trigger, and
   the risk signals pick the depth: Light, Standard or Deep.
3. The fired lenses group into calls, and an adapter runs each call on a model CLI, read-only.
4. Assemble checks every finding against the finding rules and merges the findings that report one
   defect.
5. Reporters send the result on: to stdout, to the findings store, and to the pull request as inline
   comments and a check run.

[The pipeline](./review/pipeline.md) covers each stage and what passes between them.

## The areas

| Area                          | Docs                                                                                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Review](./review/)           | [pipeline](./review/pipeline.md), [static stage](./review/static-stage.md), [routing and depth](./review/routing-and-depth.md), [calls](./review/calls.md), [lenses](./review/lenses.md), [adapters](./review/adapters.md), [findings](./review/findings.md) |
| [Config](./config/)           | [the reviewer config](./config/review-config.md), [your own rules](./config/your-own-rules.md)                                                                                                                                                               |
| [Output](./output/)           | [the CLI](./output/cli.md), [reporters](./output/reporters.md), [the GitHub App](./output/github-app.md), [the fixes-only run](./output/fixes-only-run.md)                                                                                                   |
| [Measurement](./measurement/) | [the findings store](./measurement/store.md), [the eval harness](./measurement/eval.md)                                                                                                                                                                      |

## What holds for every part

- **The core knows no project.** The packages under `modules/`, `adapters/` and `libs/` hold no
  project names, paths, stack patterns or taste rules. Those live in each user's config, under
  [0001](../decisions/0001-scope-and-your-own-rules.md), so the same build reviews any repo.
- **A module never imports an adapter.** The CLI builds each adapter and passes it to the module
  that uses it, so the review logic stays the same whichever model CLI or output runs. turbo
  boundaries checks every package against its tag, under
  [0014](../decisions/0014-the-code-layout.md).
- **The JSON output carries a version.** The CLI's result holds a schema version, so a tool that
  reads it pins a CLI version and reads one shape.

## What noslop leaves out

- **Lint.** The repo's own checks run lint before noslop.
- **Tests and reproducers.** A review only reads, so it runs no code of the repo.
- **Fixes.** The author fixes each finding; noslop never writes to the repo.
- **A rule set.** noslop ships no taste rules. Each user brings their own.
