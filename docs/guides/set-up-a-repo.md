# Set up a repo

You install the `noslop` CLI, review a branch on your own machine, and then, if you want, add a
`review.json` and have noslop post its review of every pull request as a GitHub App you register. A
repo needs no config for the first review: the built-in defaults review any change, and
[the reviewer config](../architecture/config/review-config.md) covers what they hold.

## Install the CLI

noslop runs on Bun and calls a model CLI for each review, so you need three things on your `PATH`:

- Bun, at the version the repo pins in `.bun-version`. The npm package's Bun engine is that exact
  version.
- `git`, because every review reads the change from a git repo.
- The Codex CLI (`codex`) or the Claude Code CLI (`claude`), signed in. noslop uses Codex unless
  your config or the `--adapter` flag names `claude`, and
  [adapters](../architecture/review/adapters.md) covers how each one runs.

Install the CLI from npm:

```bash
bun add -g @noslop/cli
noslop --version
```

The second command prints the version you installed.

## Review a local branch

1. Check out the branch you want reviewed, in a clone whose `origin` points at the repo.
2. Run a review from anywhere inside the repo:

   ```bash
   noslop review
   ```

   noslop reviews what the branch changed since it left the default branch, and prints a summary:
   the depth, the lenses that ran, each finding with its file and lines, and each failed call.
   [The CLI](../architecture/output/cli.md) covers how it picks the base and the head.

3. To review a different range, name the commits:

   ```bash
   noslop review --base <base_commit> --head <head_commit>
   ```

4. To use Claude Code for one run, add `--adapter claude`.

A bare `noslop review` prints its result and stores nothing. To keep each review in the findings
store, add `--report sqlite`, and read the store with `noslop store query <name>`.
[The findings store](../architecture/measurement/store.md) covers what it holds.

## Add a review.json

Put a `review.json` at the repo root when the defaults are not enough. Every key is optional, so
start with the one you need, such as the adapter:

```json
{
  "adapter": "claude"
}
```

Then check what noslop reads:

```bash
noslop config
```

The output starts with `config <hash>`, then `chain: built-in > <repo_path>/review.json`, then one
line per key with the files it came from, such as `adapter (<repo_path>/review.json): "claude"`.
Commit the file, and merge it to the default branch before you rely on it. A review reads the config
from the commit its change starts from, never from the change, because a pull request must not
weaken its own review. A pull request that adds or edits `review.json` is reviewed under the old
config, and the new one applies once it merges. `noslop config` reads your working tree, so run it
to try a change before you commit it. The keys and their meanings live in
[the config schema](../reference/review.schema.json), and
[Add your own rules](./add-your-own-rules.md) covers the rules file and a shared config repo.

## Review pull requests

noslop posts its findings, a summary comment and a `noslop` check run on a pull request as a GitHub
App that you register. noslop runs no server: your own automation, such as a CI job or a service
your org runs, runs the CLI with the App's keys on each push and after each reply.
[The GitHub App](../architecture/output/github-app.md) covers what the App posts and when the check
passes.

1. Register a GitHub App on your account or organization:
   - Leave its webhook off, because noslop acts only when a command runs.
   - Give it repository permissions for what it does: read contents, write pull requests, write
     issues, write checks, and read metadata.
2. Generate a private key for the App, and note the App's ID.
3. Install the App on the repo, and note the installation ID from the installation's settings URL.
4. On the machine or runner that reviews, [install the CLI](#install-the-cli), and give it `git` and
   a signed-in model CLI, as a local review needs.
5. Set the App's keys in that environment:

   ```bash
   export NOSLOP_GITHUB_APP_ID=<app_id>
   export NOSLOP_GITHUB_APP_PRIVATE_KEY="$(cat <private_key_file>)"
   export NOSLOP_GITHUB_APP_INSTALLATION_ID=<installation_id>
   ```

6. Run a review of a pull request in a clone of the repo. Point Bun at a config outside the repo,
   such as an empty file, so a preload in the repo's `bunfig.toml` cannot read the App's keys:

   ```bash
   bun --config=<bunfig_path> "$(command -v noslop)" review --pr <number> --repo <owner/name> --report github
   ```

   Expect a pull request review from the App with a comment per finding or per large class of like
   findings, a summary comment, and a `noslop` check run on the head.

7. Have your automation run that command on each push to the pull request. Each review covers only
   the commits since the last one.
8. Have it run `noslop check --pr <number> --repo <owner/name>`, started the same way, after each
   reply to a finding, so the check run shows the new answers with no new review.
9. Make the `noslop` check required in the branch protection of the default branch, so a pull
   request merges only once every finding holds a valid answer.

To answer the App's findings, see [Answer a finding](./answer-a-finding.md). To gate the merge with
rules of your own, see [enforce a review with a relay](./enforce-a-review-with-a-relay.md).

## Review a pull request from your machine

`noslop review --pr <number>` reviews a pull request without the App, and prints the result as a
local review does. With no App credentials in the environment, noslop reads GitHub with `GH_TOKEN`,
then `GITHUB_TOKEN`, and anonymously when neither is set, so a private repo needs a token that can
read it. It posts nothing. Set `github.app` in `review.json` to the App's slug, and your review
trusts the App's comments: it covers only the commits since the App's last review. To post as the
App, set the App's keys and run the command from step 6 of
[Review pull requests](#review-pull-requests), with Bun pointed at a config outside the repo.
