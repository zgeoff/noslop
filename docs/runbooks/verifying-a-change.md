# Verifying a change

A pull request to noslop that changes how noslop reviews merges only once the `verify / gate` check
passes. The gate passes when the pull request's description holds a verdict for each feature whose
files the pull request changes. You record a verdict with `bun verify` after you run the feature's
journey, a script that uses noslop as a user does. This runbook takes you from the credentials to
the published verdicts. The [verify skill](../../.agents/skills/verify/SKILL.md) holds each journey,
and the rules for an agent that runs them.

A journey checks what the unit tests replace with stand-ins: the real GitHub API, where the noslop
GitHub App posts its findings and sets the `noslop` check run, and a real model CLI. Each journey
opens a pull request on a sandbox repo, reviews it with the CLI from your clone's source, and closes
it at its last line.

## The features

Each feature has one journey, in the file `feature-<name>.md` in the verify skill's `references/`
folder.

| Feature           | Model CLI | What the journey does                              |
| ----------------- | --------- | -------------------------------------------------- |
| `review-and-fix`  | claude    | reviews, answers the findings, fixes, re-reviews   |
| `review-on-codex` | codex     | reviews, and checks the findings and the check run |

`review-on-codex` changes when a pull request changes the codex adapter. `review-and-fix` changes
when it changes the CLI, a module other than the eval, or the claude, GitHub or SQLite adapter. A
change to `scripts/verify/`, `package.json`, `bun.lock` or `.bun-version` changes both features.
[`feature-paths.ts`](../../scripts/verify/feature-paths.ts) holds the full map, with the shared
paths and the ignore globs. A file that an ignore glob matches, such as a doc or a test, changes no
feature.

## Set up the credentials

You need these, once:

- a sandbox repo that you may push to;
- a noslop GitHub App installed on the sandbox repo, as step 5 of
  [Set up a repo](../guides/set-up-a-repo.md) installs one;
- claude and codex signed in, with `claude auth login` and `codex login`. The doctor checks both,
  whichever feature you run.

Set these variables in your shell, and never commit them:

```bash
export NOSLOP_GITHUB_APP_ID=<app_id>
export NOSLOP_GITHUB_APP_PRIVATE_KEY="$(cat <private_key_file>)"
export NOSLOP_GITHUB_APP_INSTALLATION_ID=<installation_id>
export NOSLOP_VERIFY_REPO=<owner/name>
export GH_TOKEN=<token>
```

- The CLI posts the review as the App with its keys, and the journey reads the check run with them.
  A token can't read check runs.
- The journey uses `GH_TOKEN` as the author of the sandbox pull request: it pushes the branches,
  opens and closes the pull request, and answers the findings. The token needs write access to the
  sandbox repo. When `GH_TOKEN` is unset, the journey uses `GITHUB_TOKEN`.

## Run the journeys

1. List the features your branch changes:

   ```bash
   bun verify report --human
   ```

   Expect: a status other than `unchanged` beside each feature whose files your branch changes.

2. Start a run. A run lasts from `up` to `down`, and picks the branch prefix `verify/<run>/` for its
   pull requests on the sandbox:

   ```bash
   bun verify up
   bun verify doctor
   ```

   Expect: the doctor's last line holds `"passed":true`. When a check fails, its message holds the
   missing variable or the CLI to sign in.

3. For each changed feature, run the `bash` block of the feature's file. The block's first line
   selects the feature. Expect: each line exits 0. Each review calls the model, so a journey takes a
   few minutes.

4. Record the feature's verdict:

   ```bash
   bun verify done
   ```

   Expect: `"ok":true`. The verdict holds the fingerprint of the feature's files, so an edit to one
   of them after `done` makes the verdict stale. Repeat steps 3 and 4 for the next feature.

5. Stop the run:

   ```bash
   bun verify down
   ```

   Expect: `"stopped":true`. When a journey failed before its last line, `down` closes its pull
   request and deletes its branches.

## Publish the verdicts

1. Push your branch, and open its pull request.
2. Write the verdicts into the pull request's description:

   ```bash
   bun verify publish
   ```

   Expect: `"ok":true`. The `verify / gate` check runs again on the edit, and reads the verdicts.

## What the gate checks

The `verify / gate` check, in [`verify.yml`](../../.github/workflows/verify.yml), runs
`bun verify lint` first. Lint checks that the verify skill's journeys parse and that its feature
table matches the features. Then the gate step,
[`run-verify-gate.ts`](../../scripts/verify-gate/run-verify-gate.ts), fails the pull request in
these cases:

- a changed feature has no verdict, or its verdict holds another fingerprint;
- a changed file matches no feature's paths, no shared path and no ignore glob.

The gate step skips a pull request that the Renovate, release-please or repo-sync bot opens from its
own branch prefix. Both the bot login and the prefix must match: the gate still checks a person's
branch with the same prefix.

## Clean up a killed run

When a run stops without `down`, its open pull request stays on the sandbox. Find it by its head
branch, `verify/<run>/head`. Close it, then delete the branches `verify/<run>/head` and
`verify/<run>/base`.
