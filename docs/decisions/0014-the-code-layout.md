# 0014: The code layout

- Date: 2026-10-17
- Status: decided
- Updated: 2026-10-17

noslop is one Bun workspace in 4 folders, and every package takes the `@noslop/` scope:

| Folder      | Holds                                                                                  |
| ----------- | -------------------------------------------------------------------------------------- |
| `apps/`     | Deployables: `cli`, published as `@noslop/cli` with the bin `noslop`, and `github-app` |
| `modules/`  | `config`, `static-stage`, `routing`, `lenses`, `review`, `findings`, `eval`            |
| `adapters/` | One package per outside system: `codex`, `claude`, `github`, `sqlite`, `webhook`       |
| `libs/`     | Shared code: `contract` for the zod schemas, `testing`                                 |

A package exposes only its entry point through its `exports` map. A check by tag enforces the
boundaries: a module never imports an adapter, and libs depend only on libs. The app constructs each
adapter and passes it to the module that uses it.

## Why

- Adapters in their own folder keep each outside system's client in one package.
- Modules that never import an adapter can be tested with stand-ins and run with any model.
- The unscoped `noslop` package name belongs to someone else, and `@noslop/` is free to publish
  under.

## Alternatives

- **One flat `packages/*` folder.** The boundaries show only in package names, which no check reads.
- **A folder of rule packs.** noslop ships no rule set, under
  [0001](0001-scope-and-your-own-rules.md).

## Consequences

- Each build step creates the packages it first needs.

## Changes

- 2026-10-17: added the `sqlite` and `webhook` adapters for the reporters in
  [0015](0015-reporters.md).
