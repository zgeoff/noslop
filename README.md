<div align="center">
  <h1>noslop</h1>

  <p>
    <a href="https://www.npmjs.com/package/@noslop/cli"><img src="https://img.shields.io/npm/v/@noslop/cli" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="./docs/README.md">Documentation</a> •
    <a href="./docs/guides/set-up-a-repo.md">Set up a repo</a> •
    <a href="./docs/guides/add-your-own-rules.md">Add your own rules</a>
  </p>
</div>

DIY AI code review pipeline. Front loaded static analysis feeding multi-lens review w/ depth routing
& BYO configuration.

**Warning**: this might be slop.

## Install

```bash
bun add -g @noslop/cli
```

noslop runs on [Bun](https://bun.sh) and needs the Codex CLI or the Claude Code CLI on your `PATH`,
signed in.

## Supported model CLIs

- **Codex**: the default; each call runs read-only.
- **Claude Code**: each call runs with the read tools alone.

## Features

- **A static stage before any model**: one parse of the change finds what code can decide, and
  routes each lens to the slice it needs. See
  [the static stage](docs/architecture/review/static-stage.md).
- **Lenses by trigger**: correctness on every change, every other lens only when the change calls
  for it. See [routing and depth](docs/architecture/review/routing-and-depth.md).
- **Depth by risk**: a small change gets a light review, and a change to a risk class a deep one.
  See [routing and depth](docs/architecture/review/routing-and-depth.md#picking-the-depth).
- **Findings you can check**: each finding anchors to the diff and carries a severity and a verdict.
  See [findings](docs/architecture/review/findings.md).
- **Your own rules**: the taste lenses read your rules files and cite each finding to a quote from
  them. See [your own rules](docs/architecture/config/your-own-rules.md).
- **A merge gate**: the GitHub App posts inline comments and a check run that passes once every
  finding has an answer. See [the GitHub App](docs/architecture/output/github-app.md).
- **Measurement**: a store of every finding and its answer, and an eval harness that replays a
  labelled corpus. See [the findings store](docs/architecture/measurement/store.md).

## Configuration

A repo works with no config. A `review.json` at the repo root sets your rules files, your stack's
patterns and your risk classes, and can extend a shared config repo; `noslop config` prints the
merged result. [The reviewer config](docs/architecture/config/review-config.md) covers how it
merges, and the [JSON Schema](docs/reference/review.schema.json) lists every key.

## Documentation

The [docs index](docs/README.md) lists the guides, the architecture docs and the decision records.
