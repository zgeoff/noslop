# 0015: Reporters and disposition sources

- Date: 2026-10-17
- Status: decided

A review produces one result, and a list of reporters sends it out. Each reporter is an adapter
package with one interface, `report(result, ctx)`, and every reporter receives the same result. The
config picks the reporters, such as `"report": ["github", "sqlite"]`. With no config, only `json`
runs.

| Reporter  | Sends the result to                                  |
| --------- | ---------------------------------------------------- |
| `json`    | stdout or a file; the CLI's `--json`                 |
| `github`  | Inline comments, a summary comment and the check run |
| `sqlite`  | The local findings store                             |
| `webhook` | A URL, as JSON                                       |

Dispositions flow the other way, through a disposition source. The GitHub adapter is both a reporter
and a disposition source. The findings store records dispositions from any source.

## Why

- One result schema keeps every destination in agreement.
- A new destination is a new adapter, with no change to the review.
- Another tool reads the store through `noslop store query --json` at a pinned CLI version, so the
  store's tables can change without breaking it.

## Alternatives

- **A fixed set of outputs in the CLI.** Each new destination changes the CLI.
- **Readers query the store's tables directly.** Every schema change breaks them.

## Consequences

- The store is the `sqlite` reporter plus the queries that read it.
- A host that is not GitHub needs its own reporter and disposition source.
