# Releasing

release-please and the `main` workflow release `@noslop/cli` to npm: release-please opens a release
pull request after a releasable commit lands on `main`, and once that pull request merges, it tags
the release and the workflow publishes the CLI with npm provenance. This runbook holds only the
steps they do not do: the one-time setup before the first automated release, merging each release
pull request, and the republish of a release that tagged but failed to publish.
[The CLI](../architecture/output/cli.md) covers what the published package holds.

## One-time setup

The release job in `.github/workflows/main.yml` runs only once the `RELEASE_ENABLED` repo variable
is `true`. npm sets up trusted publishing only for a package that exists on the registry, so the
first version goes out from a maintainer's machine, and CI publishes every later one.

1. Sign in to npm as an account that can publish under the `@noslop` scope:

   ```bash
   npm login
   npm whoami
   ```

   Expect `npm whoami` to print your npm username.

2. From the repo root, on an up-to-date `main`, run the first publish:

   ```bash
   bash scripts/first-publish.sh
   ```

   Expect `published @noslop/cli@<version>`, followed by the remaining setup steps. The script stops
   with `not logged in to npm; run: npm login` when you skipped step 1, and with
   `@noslop/cli already exists on npm; releases go through CI, not this script` when the package is
   on npm.

3. Open `https://www.npmjs.com/package/@noslop/cli/access` and add a trusted publisher for GitHub
   Actions with these fields:

   ```text
   organization or user: zgeoff
   repository:           noslop
   workflow filename:    main.yml
   environment:          (leave empty)
   ```

   Expect the publisher listed on the access page.

4. In the repo's Settings, under Actions and then General, check "Allow GitHub Actions to create and
   approve pull requests". release-please needs it to open the release pull request.
5. Turn the release job on:

   ```bash
   gh variable set RELEASE_ENABLED --repo zgeoff/noslop --body true
   ```

   Expect `gh variable list --repo zgeoff/noslop` to show `RELEASE_ENABLED` with the value `true`.

6. Push or merge the next commit to `main`. Expect the `main` workflow's release job to run after
   its checks.

## Merge a release pull request

Nothing merges a release pull request on its own, so each release waits for a maintainer.

1. Find the open pull request from the `release-please--branches--main` branch. Its title holds the
   next version, and its changes bump the version and update the changelog. The release job adds a
   commit that syncs the lockfile and the formatting when the bump needs one.
2. Check that the pull request passes the checks. When the `RELEASE_APP_ID` repo variable and the
   `RELEASE_APP_PRIVATE_KEY` secret are set, the pull request runs its checks like any other.
   Without them, release-please opens it with the workflow's own token, which starts no workflow, so
   it shows no checks: check out the branch and run `bun run check` yourself. Expect every script to
   pass.
3. Merge the pull request.
4. Expect a new `main` workflow run, whose release job tags `@noslop/cli@<version>` and publishes
   that version. The workflow log of the publish step ends with npm's publish output.
5. Check the registry:

   ```bash
   npm view @noslop/cli version
   ```

   Expect the version you released.

When another merge landed first and the release ran on a later commit than the tag, the release job
dispatches a separate publish run at the tag. Expect the log line
`<tag> is not this run's commit (<sha>); publishing from a run at the tag`, then a
`workflow_dispatch` run of `main` at the tag.

## Republish a release that failed to publish

A release can tag and then fail in its publish step, such as on an npm outage. Rerun the publish at
the tag:

1. Find the release tag, `@noslop/cli@<version>`:

   ```bash
   git fetch --tags
   git tag --list '@noslop/cli@*'
   ```

2. Dispatch the `main` workflow at that tag:

   ```bash
   gh workflow run main.yml --repo zgeoff/noslop --ref @noslop/cli@<version>
   ```

   The dispatched run skips release-please and publishes the CLI from the tag.

3. Watch the run:

   ```bash
   gh run watch --repo zgeoff/noslop
   ```

   Expect the publish step to publish the version, or to print
   `skipping @noslop/cli@<version>: already published` when npm holds that version.

4. Run `npm view @noslop/cli version`. Expect the version of the tag.
