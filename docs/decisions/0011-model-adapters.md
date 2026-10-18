# 0011: Model adapters

- Date: 2026-10-17
- Status: decided
- Updated: 2026-10-18

Each model CLI sits behind an adapter. An adapter takes a prompt and an output schema, runs the CLI,
and returns JSON. It maps the 3 depths onto the CLI's own effort names. Every adapter in noslop is
configured read-only in its own code: no writes to the repo, no tests, no network to production.
noslop ships a Codex adapter and a Claude adapter.

noslop itself is a versioned CLI with JSON output, so other tools pin a version and read its
results. It ships as one npm package, `@noslop/cli`, which holds the `noslop` bin and runs on Bun.
The package is one Bun bundle of the CLI and every workspace package it imports, lens prompts
included. Its one dependency is oxc-parser, whose native build npm installs for each platform. No
workspace package is published on its own. release-please releases the package under the `@noslop`
npm org, with trusted publishing. A review writes only to its own temp folder outside `/tmp`, and
deletes that folder whether it passes or fails. When an adapter adds to a CLI's instructions, it
appends to the user's own instructions and never replaces them. The Claude adapter loads no settings
files, so it keeps no user instructions: the user's settings would also load their hooks and plugins
into every call.

A review that runs unattended, such as the GitHub App's server or a scheduled runner, signs its
model CLI in with an API key, not with a subscription login.

## Why

- Routing, depth and blocking live in noslop, so swapping the model changes none of them.
- A second adapter keeps reviews running when one model's service is down.
- A pinned CLI version lets other tools upgrade on their own schedule.
- One bundled package pins every part of noslop at one version, and the workspace packages stay
  internal, consumed as source.
- Trusted publishing lets the release workflow publish with no npm token stored in the repo.
- A subscription login belongs to one person's interactive use, and an unattended job has nobody to
  sign it in again when it lapses.

## Alternatives

- **One model CLI, called directly.** An outage of that service stops every review.
- **A runtime check that an adapter is read-only.** The adapters ship inside noslop, so their own
  configuration is the place to set it.
- **Publish each workspace package to npm.** Every internal boundary becomes a public API with a
  version of its own, and each package exports TypeScript source that would need a build of its own.

## Consequences

- An adapter declares its effort mapping and its timeout.

## Changes

- 2026-10-17: the Claude adapter loads no settings files, so it keeps no user instructions, because
  user settings would also load hooks and plugins into every call.
- 2026-10-18: noslop publishes one npm package, `@noslop/cli`, as a Bun bundle of the CLI and the
  workspace packages it imports, with oxc-parser as its one dependency.
- 2026-10-18: release-please releases `@noslop/cli` with trusted publishing, and an unattended
  review runs its model CLI on an API key.
