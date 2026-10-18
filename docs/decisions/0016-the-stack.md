# 0016: The stack

- Date: 2026-10-17
- Status: decided
- Updated: 2026-10-18

noslop builds on this stack:

| Concern                    | Library                                              |
| -------------------------- | ---------------------------------------------------- |
| Runtime, tests             | Bun, `bun test`, msw, faker                          |
| CLI                        | gunshi                                               |
| Schemas and validation     | zod                                                  |
| Branching on variants      | ts-pattern, with `switch` only for a concrete reason |
| Logging                    | LogTape                                              |
| Parsing                    | oxc-parser                                           |
| The findings store         | Kysely on `bun:sqlite`                               |
| The GitHub App's server    | Elysia                                               |
| GitHub's API and webhooks  | `@octokit/app`, `@octokit/webhooks`, `@octokit/core` |
| GitHub's API types         | `@octokit/types`                                     |
| The GitHub test stand-in   | msw 2.15.0 with `@msw/data`                          |
| Spawning a CLI             | One injected runner on `Bun.spawn`                   |
| The package's declarations | tsdown on TypeScript 7                               |

## Why

- tsdown bundles declarations with TypeScript 7's own emit, which has no JavaScript API for a
  declaration bundler to call. Bun's bundler writes JavaScript only.
- LogTape logs nothing until the host configures it, which suits a tool that others install.
- oxc-parser gives the static stage a full TypeScript syntax tree with no native build step to
  manage.
- An injected runner keeps process spawning in one place, which tests replace with a stand-in.
- GitHub's own SDK handles App auth, token refresh and webhook signatures. `@octokit/core` is the
  typed client an installation token drives, and `@octokit/types` types its routes.
- msw with `@msw/data` stands in for GitHub's API and for a webhook receiver in tests, over an
  in-memory store the handlers read and write.

## Alternatives

- **pino for logging.** It suits a long-running service, and it writes output whether or not the
  host wants it.
- **execa for spawning.** It adds start-up cost and a second way to spawn.
- **citty for the CLI.** It has had no release in months, and gunshi covers its features.

## Consequences

- Only the store package imports Kysely and `bun:sqlite`.
- Only the runner calls `Bun.spawn`.
- gunshi is pinned to its release candidate until 1.0.0 ships.
- msw is pinned to 2.15.0, because msw 3 does not intercept `fetch` under Bun 1.4.2.

## Changes

- 2026-10-17: added `@octokit/core` and `@octokit/types` for the typed GitHub client, and msw 2.15.0
  with `@msw/data` for the GitHub and webhook test stand-in.
- 2026-10-18: dropped tiny-invariant, p-retry, lru-cache, nanoid and XState, which no package
  imports.
- 2026-10-18: added tsdown, which writes the npm package's declarations on TypeScript 7.
