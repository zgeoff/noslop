# Agent Guidelines

This repo is noslop, a reviewer for pull requests that coding agents write. `docs/decisions/` holds
the decision records, and `docs/architecture/` describes the code as it is built.

## Required reading

The rules a task needs are not repeated here. Load the skill for the work before starting it.

| Skill           | Load before                                                                        |
| --------------- | ---------------------------------------------------------------------------------- |
| `docs-writing`  | writing or editing any committed prose: `docs/`, READMEs, this file                |
| `code-style`    | writing, reviewing, or renaming any TypeScript — the shared function-verb taxonomy |
| `testing`       | designing, writing, or reviewing tests                                             |
| `skill-writing` | writing or editing a skill under `.claude/skills/`                                 |

## Operations

- Every change reaches `main` through a pull request, and the pull request merges only once CI
  passes. Work on a branch, push the branch, and open a pull request with the repo's template.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages, with a
  lowercase header of at most 72 characters.
- Commit subjects use the imperative mood ("add X", never "added X" or a bare noun phrase).

## Repo structure

noslop is one Bun workspace. Every package takes the name `@noslop/<folder>` and is consumed as
source through an `exports` map that points at `src/index.ts`.
[0014](docs/decisions/0014-the-code-layout.md) records the layout.

```text
apps/              deployables
  cli/             @noslop/cli, the bin `noslop`; composition root for a review
  github-app/      the server the GitHub App runs; it runs the CLI for each webhook delivery
modules/           config, static-stage, routing, lenses, review, findings, eval
adapters/          one outside system each: codex, claude, github, sqlite, webhook
libs/              shared code that belongs to no domain: contract, runner, testing
docs/
  architecture/    what is built, by area, with an overview
  guides/          the steps a user takes, one task each
  runbooks/        contributor and maintainer procedures: development, the eval, releasing
  reference/       generated reference: the JSON Schema of review.json
  decisions/       numbered decision records
  design/          a design for work not yet built; only the owner opens a design
scripts/           the CLI package build, the config schema writer, the first publish, the release
                   ship and publish steps
```

`bun run schema:config` writes `docs/reference/review.schema.json` from the config schema, and a
contract test fails while the committed file differs.

## Packages

Dependencies:

- Every external version lives once, in the root `workspaces.catalog`. A package writes `"catalog:"`
  for an external dependency and `"workspace:*"` for an internal one.
- The root `package.json` declares only tooling.
- Pin exact versions, with no `^` or `~` ranges.

Boundaries:

- `turbo boundaries` checks each dependency against the tags in the root `turbo.json`.
- A lib depends only on libs.
- A module never imports an adapter and never forms a cycle with another module. The app constructs
  each adapter and passes it to the module that uses it.
- The core packages hold no project names, paths, stack patterns or taste rules. Those live in each
  user's config.

## Stack

Build on the libraries in [0016](docs/decisions/0016-the-stack.md). A library outside that list is a
choice for the owner.

## Working here

- **Choices that need the owner.** The owner decides architecture, framework, library and technology
  choices, naming, and the review rules. Bring each such choice to the owner with its options, a
  recommendation and the trade-off. A decision record exists only for what the owner agreed. Close
  questions that evidence or an existing decision settles, and set configurable defaults for tuning
  values without asking.
- **Decision records.** A changed decision is edited in place: the record keeps its number, its
  header gains an `Updated` date, and a `## Changes` list at its end gives each change's date and a
  one-line summary. A new record is only for a new decision.
- **Designs.** When a part of a design under `docs/design/` lands, the change that lands it moves
  that part to `docs/architecture/`, rewritten to describe the code.
- **Attribution.** Commit messages carry no attribution lines: no co-author trailers and no
  generator notes.
- **Plans.** A plan for work about to be built lives outside `docs/`.

## Public repo

The repo is public, and everything pushed to it stays public. Keep your own environment out of it,
so your setup never leaks through your work.

- Leave out home directory paths, host names, private network names, cloud details, and the names of
  the tools and agents you work with.
- Leave out any one user's rules, repos and evidence. noslop ships no rule set, under
  [0001](docs/decisions/0001-scope-and-your-own-rules.md).
- Explain each choice by what noslop needs, so the reason stays true when other products change.

Before you commit, grep the diff for `sk-ant`, `GOCSPX`, `AGE-SECRET-KEY`, `ops_`, `/home/` and
`.ts.net`.

## Toolchain

- Bun is pinned in `.bun-version`. `bun run format` fixes formatting, and `bun run check` runs every
  check that CI runs.
- CI runs the shared Bun pull-request workflow from zgeoff/tools on each pull request and each push
  to `main`. The `BUN_CHECK_SCRIPTS` repo variable holds its script list:
  `audit deadcode format:check lint:full typecheck boundaries prose test`. A change to that list
  changes `bun run check` in the same commit.
- `lint:full` adds the type-aware rules and fails on an unused disable directive. It runs in CI and
  in `bun run check`, never in a git hook.
- lefthook runs oxlint, oxfmt, format-codemod and gitleaks before a commit, and commitlint on the
  message. Before a push it runs boundaries and the prose check, then the shared pre-push baseline:
  the format check and typecheck over the whole tree, and lint and the tests over what the branch
  changes.
