# Development

noslop is one Bun workspace, and every check CI runs also runs on your machine through
`bun run check`. This runbook sets up a clone, runs the checks and the git hooks, runs the CLI from
source against another repo, and runs the model eval. [0014](../decisions/0014-the-code-layout.md)
records the layout of the workspace, and [0016](../decisions/0016-the-stack.md) records the
libraries it builds on.

## Set up a clone

1. Install Bun at the version in `.bun-version`, and check it:

   ```bash
   bun --version
   ```

   Expect the version `.bun-version` holds.

2. Install the dependencies from the repo root:

   ```bash
   bun install
   ```

   Bun installs the exact versions in `bun.lock`, and the `prepare` script installs the git hooks.
   The root `bunfig.toml` holds the install settings, such as the isolated linker and the minimum
   release age a new dependency must reach.

3. Install `gitleaks` on your `PATH`. The pre-commit hook runs it, and a commit fails without it.

## Run the checks

Run every check that CI runs:

```bash
bun run check
```

Expect each script to pass in turn: audit, dead code, the format check, the type-aware lint,
typecheck, the dependency boundaries, the prose check and the tests. CI runs the same list on each
pull request and each push to `main`, from the `BUN_CHECK_SCRIPTS` repo variable, so a change to the
list changes `bun run check` in the same commit. `bun run format` fixes what the format check
reports.

Run one package's tests, or one file, with a path:

```bash
bun test ./modules/config
```

The test preload in `bunfig.toml` registers the extra matchers and starts the stand-in GitHub API,
so the tests reach no real GitHub. The `testing` skill holds the rules for writing tests.

## The git hooks

lefthook runs the hooks that `bun install` installed.

- Before a commit, it fixes the staged files with oxlint and oxfmt, runs format-codemod on staged
  TypeScript, and scans the staged diff with gitleaks.
- On the commit message, it runs commitlint.
- Before a push, it runs the dependency boundaries and the prose check, then the format check and
  typecheck over the whole tree, then lint and the related tests over what the branch changes.

The type-aware lint, the dead-code check and the whole test suite run only in `bun run check` and
CI, so a push that passes the hooks can still fail CI.

## Run the CLI from source

The workspace runs the CLI from its source, with no build. To review another repo with your working
copy of noslop, run it from inside that repo:

```bash
cd <other_repo>
bun --config=<noslop_repo>/bunfig.toml <noslop_repo>/apps/cli/src/cli.ts review
```

Expect the same summary an installed `noslop review` prints.

Keep the `--config` flag. Bun reads `bunfig.toml` from the working directory, so without the flag it
loads the other repo's Bun config, and any preload in it runs inside the CLI's process. The flag
makes Bun read noslop's own config instead. The App server runs each job the same way, with the path
to noslop's `bunfig.toml`, so a reviewed repo's code never runs beside the App's credentials.
[The GitHub App](../architecture/output/github-app.md) covers that boundary.

Add `--verbose` to see the debug log on stderr. Every other flag is in `noslop <command> --help`.

## Run the model eval

`integration/` holds the flows that cross several packages in one process, and every test run runs
them. The relay flow sends a review from a developer's context through a local relay, which verifies
and posts it, against the stand-in GitHub API and a stub model.

`evals/` holds the journeys that call a live model. The seeded-defects journey builds a small repo
with seeded defects, runs a real review on it with a real model CLI, and checks that the findings
land at anchors in the diff. Bun skips it unless `NOSLOP_E2E_ADAPTER` is set to an adapter.

1. Sign in to the model CLI you will use, `codex` or `claude`.
2. Run the eval with that adapter:

   ```bash
   NOSLOP_E2E_ADAPTER=codex bun test ./evals
   ```

   Expect `1 pass` and `0 fail`. The seeded-defects review calls the model, so it can run for many
   minutes, and it uses that account's quota.

Without the variable, `bun test ./evals` prints `1 skip`, and the test step of `bun run check`
counts the seeded-defects journey as skipped.

## Build the npm package

`bun run build:cli` bundles the CLI and every workspace package it imports into `apps/cli/dist`,
with a manifest that holds no workspace dependency, and prints
`built @noslop/cli@<version> in apps/cli/dist`. Use it to check the package that a release
publishes. [The CLI](../architecture/output/cli.md) covers what the bundle holds, and
[Releasing](./releasing.md) covers the publish.
