# Verifying a change

Before a pull request that changes a review can merge, someone runs the journey of each feature it
changes with `bun verify`, and writes the verdicts into the pull request. The `verify / gate` check
fails the pull request until each changed feature has a verdict for its current code. This runbook
sets up the credentials, runs the journeys and publishes the report. The
[verify skill](../../.agents/skills/verify/SKILL.md) holds each journey and the rules for an agent
that runs them.

A journey drives the two boundaries that the unit tests replace with stand-ins: the real GitHub API,
where the App posts its findings and sets the `noslop` check run, and a real model CLI. Each journey
opens a pull request on a sandbox repo, reviews it with the CLI from your clone's source, and closes
it at the end.

## The features

| Feature           | Journey                                                                                       | Changed by                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `review-and-fix`  | a review on claude, a `not-a-defect` answer and `noslop check`, a fix, a fixes-only re-review | the CLI, every module but eval, and the claude, GitHub and SQLite adapters |
| `review-on-codex` | a review on codex, with findings and a failing check                                          | the codex adapter                                                          |

A change to `scripts/verify/`, `package.json`, `bun.lock` or `.bun-version` changes both features.
[`feature-paths.ts`](../../scripts/verify/feature-paths.ts) holds the full map, with the files that
change no feature, such as docs and tests.

## Set up the credentials

You need a sandbox repo that you may push to, with a noslop GitHub App installed on it. Set these in
your shell, and never commit them:

```bash
export NOSLOP_GITHUB_APP_ID=<app_id>
export NOSLOP_GITHUB_APP_PRIVATE_KEY="$(cat <private_key_file>)"
export NOSLOP_GITHUB_APP_INSTALLATION_ID=<installation_id>
export NOSLOP_VERIFY_REPO=<owner/name>
export GH_TOKEN=<token>
```

- The App's keys let the CLI post as the App, and let the journey read the check run. A token can't
  read check runs.
- `GH_TOKEN`, or `GITHUB_TOKEN`, is the pull request's author: it pushes the branches, opens and
  closes the pull request, and answers the findings. It needs write access to the sandbox repo.
- Sign in claude with `claude auth login`, and codex with `codex login`.

## Run the journeys

1. Read which features your branch changes:

   ```bash
   bun verify report --human
   ```

   Expect: `changed` beside each feature whose files your branch changes.

2. Start a run, and check the setup:

   ```bash
   bun verify up
   bun verify doctor
   ```

   Expect: the doctor's last line holds `"passed":true`. When a check fails, its message names the
   missing variable or the CLI to sign in.

3. For each changed feature, run the `bash` block of its file in the verify skill's `references/`
   folder, then record the verdict:

   ```bash
   bun verify done
   ```

   Expect: each line of the journey exits 0, then `done` prints `"ok":true`. A journey takes a few
   minutes, because each review calls the model.

4. Stop the run:

   ```bash
   bun verify down
   ```

   Expect: `"stopped":true`. `down` closes the run's pull request when a journey stopped before its
   last line.

## Publish the report

Push your branch and open its pull request, then write the report into the pull request's
description:

```bash
bun verify publish
```

Expect: `"ok":true`. The `verify / gate` check runs again on the edit, and reads the report.

## What the gate checks

The `verify / gate` check, in [`verify.yml`](../../.github/workflows/verify.yml), runs
`bun verify lint`, then the gate step in
[`run-verify-gate.ts`](../../scripts/verify-gate/run-verify-gate.ts). It fails a pull request in
these cases:

- a changed feature has no verdict, or a verdict for other code;
- a changed file matches no feature, no shared path and no ignore glob.

The gate step skips the pull requests that Renovate, release-please and repo-sync open, by their bot
login and branch prefix. A person's branch with the same prefix still meets the gate.

When a run is killed before `down`, its pull request stays open on the sandbox, on a branch under
`verify/`. Close it, and delete its 2 branches.
