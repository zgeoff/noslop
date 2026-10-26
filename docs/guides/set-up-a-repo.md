# Set up a repo

You install the `noslop` CLI, review a branch on your own machine, and then, if you want, add a
`review.json` and have noslop review every pull request through a GitHub App you run. A repo needs
no config for the first review: the built-in defaults review any change, and
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
line per key with the file it came from, such as `adapter (<repo_path>/review.json): "claude"`.
Commit the file, and merge it to the default branch before you rely on it. A review reads the config
from the commit its change starts from, never from the change, because a pull request must not
weaken its own review. A pull request that adds or edits `review.json` is reviewed under the old
config, and the new one applies once it merges. `noslop config` reads your working tree, so run it
to try a change before you commit it. The keys and their meanings live in
[the config schema](../reference/review.schema.json), and
[Add your own rules](./add-your-own-rules.md) covers the rules file and a shared config repo.

## Review pull requests

noslop reviews pull requests through a GitHub App that you register and a server that you run. The
server receives each webhook, runs `noslop review --pr` in a clone of the repo, and posts the
findings, a summary comment and a `noslop` check run.
[The GitHub App](../architecture/output/github-app.md) covers what it posts and when the check
passes.

1. Register a GitHub App on your account or organization:
   - Set the webhook URL to `https://<server_host>/webhook`, and set a webhook secret.
   - Subscribe it to the pull request, pull request review comment and issue comment events.
   - Give it repository permissions for what it does: read contents, write pull requests, write
     issues, write checks, and read metadata.
2. Generate a private key for the App, and note the App's ID.
3. On the machine that runs the server, clone noslop and install its dependencies:

   ```bash
   git clone https://github.com/zgeoff/noslop.git
   cd noslop
   bun install
   ```

   That machine needs Bun, `git` and a signed-in model CLI, as a local review does.

4. Set the server's environment, then start it:

   ```bash
   export NOSLOP_GITHUB_APP_ID=<app_id>
   export NOSLOP_GITHUB_APP_PRIVATE_KEY="$(cat <private_key_file>)"
   export NOSLOP_GITHUB_WEBHOOK_SECRET=<webhook_secret>
   export NOSLOP_GITHUB_APP_REPOS_DIR=<folder_for_clones>
   bun run --cwd apps/github-app start
   ```

   Expect the log line `the noslop App listens on port 3000`. `PORT` sets another port. When a key
   is missing, the server refuses to start with `the noslop App needs these settings:` and the
   missing keys.

5. Check that the server answers: `curl https://<server_host>/health` prints `ok`.
6. Install the App on the repo.
7. Open a pull request, or mark a draft ready for review. Expect a pull request review from the App
   with a comment per finding or per large class of like findings, a summary comment, and a `noslop`
   check run on the head.
8. Make the `noslop` check required in the branch protection of the default branch, so a pull
   request merges only once every finding holds a valid answer.

The App reviews each new push to the pull request again, and covers only the commits since the last
review. To answer its findings, see [Answer a finding](./answer-a-finding.md).

## Review a pull request from your machine

`noslop review --pr <number>` reviews a pull request without the App, and prints the result as a
local review does. With no App credentials in the environment, noslop reads GitHub with `GH_TOKEN`,
then `GITHUB_TOKEN`, and anonymously when neither is set, so a private repo needs a token that can
read it. It posts nothing. Set `github.app` in `review.json` to the App's slug, and your review
trusts the App's comments: it covers only the commits since the App's last review. To post as the
App, set `NOSLOP_GITHUB_APP_ID`, `NOSLOP_GITHUB_APP_PRIVATE_KEY` and
`NOSLOP_GITHUB_APP_INSTALLATION_ID`, and add `--report github`.
