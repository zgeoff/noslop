# Verifying a change

A pull request to noslop that changes how noslop reviews merges only once the `verify / gate` check
passes. The gate passes when the pull request's description holds a verdict for each feature whose
files the pull request changes. You record a verdict with `bun verify` after you run the feature's
journey, a script that uses noslop as a user does. This runbook takes you from the credentials to
the published verdicts. The [verify skill](../../.agents/skills/verify/SKILL.md) holds each journey,
and the rules for an agent that runs them.

A journey reaches 2 systems that the unit tests replace with stand-ins:

- the real GitHub API, where the noslop GitHub App posts its findings and sets the `noslop` check
  run;
- a real model CLI, claude or codex.

Each journey opens a pull request on a sandbox repo: the sandbox pull request. The journey reviews
it with the noslop CLI from your clone's source. The journey's last line closes the sandbox pull
request.

## The features

Each feature has one journey, in the file `feature-<name>.md` in the verify skill's `references/`
folder.

| Feature           | Model CLI | What the journey does                              |
| ----------------- | --------- | -------------------------------------------------- |
| `review-and-fix`  | claude    | reviews, answers the findings, fixes, re-reviews   |
| `review-on-codex` | codex     | reviews, and checks the findings and the check run |

A pull request needs a verdict for each feature whose files it touches:

- `review-on-codex`: the codex adapter.
- `review-and-fix`: the CLI, each module but the eval, and the claude, GitHub and SQLite adapters.
- both: `scripts/verify/`, `package.json`, `bun.lock` and `.bun-version`, the shared paths.

A pull request that touches only files an ignore glob matches, such as docs and tests, needs no
verdict. [`feature-paths.ts`](../../scripts/verify/feature-paths.ts) holds the full map.

## Set up the credentials

You need these, once:

- a sandbox repo that you may push to;
- a noslop GitHub App installed on the sandbox repo, as step 5 of
  [Set up a repo](../guides/set-up-a-repo.md) installs one;
- claude and codex signed in, with `claude auth login` and `codex login`. `bun verify doctor`, in
  step 2 of [Run the journeys](#run-the-journeys), checks both, whichever feature you run.

Set these variables in your shell, and never commit them:

```bash
export NOSLOP_GITHUB_APP_ID=<app_id>
export NOSLOP_GITHUB_APP_PRIVATE_KEY="$(cat <private_key_file>)"
export NOSLOP_GITHUB_APP_INSTALLATION_ID=<installation_id>
export NOSLOP_VERIFY_REPO=<owner/name>
export GH_TOKEN=<sandbox_token>
```

- Set the 3 `NOSLOP_GITHUB_APP_` variables to the App's keys. The noslop CLI posts the review as the
  App with them. The journey reads the check run with them too: GitHub refuses a personal token on
  the check runs API.
- Set `NOSLOP_VERIFY_REPO` to the sandbox repo.
- Set `GH_TOKEN` to a token with write access to the sandbox repo. The journey acts as the sandbox
  pull request's author with it: it pushes the pull request's base and head branches, opens and
  closes the pull request, and answers the findings. When `GH_TOKEN` is unset, the journey uses
  `GITHUB_TOKEN`.

## Run the journeys

1. List the features your branch changes:

   ```bash
   bun verify report --human
   ```

   Expect: a status other than `unchanged` beside each feature whose files your branch changes.

2. Start a run, which lasts from `up` to `down`. `up` picks the run's ID, 8 hex characters that it
   prints in `data.endpoints.run`. Each sandbox pull request of the run uses the branches
   `verify/<run_id>/base` and `verify/<run_id>/head`.

   ```bash
   bun verify up
   bun verify doctor
   ```

   Expect: the doctor's last line holds `"passed":true`. A failed check's message holds the missing
   variable or the CLI to sign in.

3. For each changed feature, run the `bash` block of the feature's file. The block's first line,
   `bun verify use --feature <name>`, selects the feature for each later command. Expect: each line
   exits 0. Each review calls the model, so a journey takes a few minutes. When a line fails, follow
   the verify skill's Commands section, then run the block again from its first line.

4. Record the feature's verdict:

   ```bash
   bun verify done
   ```

   Expect: `"ok":true`. `done` records the verdict of the feature that step 3 selected, in
   `.wringer/` in your clone. The verdict holds the fingerprint of the feature's files, so an edit
   to one of them after `done` makes the verdict stale. Repeat steps 3 and 4 for the next feature.

5. Stop the run:

   ```bash
   bun verify down
   ```

   Expect: `"stopped":true`. When a journey failed before its last line, `down` closes the sandbox
   pull request and deletes its branches.

## Publish the verdicts

1. Push your branch.
2. Open the pull request for your branch.
3. Write the verdicts into that pull request's description. `publish` finds the pull request from
   your branch, and writes with `GITHUB_TOKEN` or the token that `gh auth token` prints:

   ```bash
   bun verify publish
   ```

   Expect: `"ok":true`. The `verify / gate` check runs again on the edit, and reads the verdicts.

## What the gate checks

The `verify / gate` check, in [`verify.yml`](../../.github/workflows/verify.yml), runs
`bun verify lint` first. Lint checks that each journey in the verify skill parses, and that the
skill's table of features matches the features in the registry. Then the gate step,
[`run-verify-gate.ts`](../../scripts/verify-gate/run-verify-gate.ts), fails the pull request in
these cases:

- a changed feature has no verdict, or its verdict holds another fingerprint;
- a changed file matches no feature's paths, no shared path and no ignore glob.

The gate step skips a pull request that the Renovate, release-please or repo-sync bot opens from its
own branch prefix. Both the bot login and the prefix must match: the gate still checks a person's
branch with the same prefix.

## Clean up a killed run

When the process that `up` started dies before `down`, its sandbox pull request stays open. Clean it
up by hand:

1. On the sandbox repo, find the open pull request whose head branch is `verify/<run_id>/head`.
2. Close it.
3. Delete the branches `verify/<run_id>/head` and `verify/<run_id>/base`. Expect: no branch under
   `verify/<run_id>/` on the sandbox.
