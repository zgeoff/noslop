# 0015: Reporters and disposition sources

- Date: 2026-10-17
- Status: decided
- Updated: 2026-10-18

A review produces one result, and a list of reporters sends it out. Every reporter has one
interface, `report(result, ctx)`, and receives the same result. A reporter that talks to an outside
system is an adapter package. The `json` reporter is the CLI's own output, so it lives in the CLI.
The config picks the reporters, such as `"report": ["github", "sqlite"]`. With no config, only
`json` runs.

| Reporter  | Sends the result to                                  |
| --------- | ---------------------------------------------------- |
| `json`    | stdout or a file; the CLI's `--json`                 |
| `github`  | Inline comments, a summary comment and the check run |
| `sqlite`  | The local findings store                             |
| `webhook` | A URL, as JSON                                       |

Dispositions flow the other way, through a disposition source. The GitHub adapter is both a reporter
and a disposition source. The findings store records dispositions from any source.

The `github` reporter writes each comment for a person to read. A comment holds no block of prompts
for an agent, no suggestion block and no risk sentence that a model wrote. The summary's risk level
follows from the findings' severities. The finding's id, lens, criterion and rule, and the forms of
reply, sit in collapsed blocks under the finding. When a review confirms a fix, the reporter edits
that finding's comment in place.

## Why

- One result schema keeps every destination in agreement.
- A new destination is a new adapter, with no change to the review.
- A person answers each finding, so a comment shows the finding first and keeps the review's own
  fields out of the way.
- A risk level computed from the severities agrees with the findings on every run, and a sentence
  from a model can contradict them.
- An edit in place keeps one thread per finding, from the first review to the confirmed fix.
- Another tool reads the store through `noslop store query --json` at a pinned CLI version, so the
  store's tables can change without breaking it.

## Alternatives

- **A fixed set of outputs in the CLI.** Each new destination changes the CLI.
- **Readers query the store's tables directly.** Every schema change breaks them.
- **A prompt block for agents and suggestion blocks in each comment.** They bury the finding for the
  person who answers it.

## Consequences

- The store is the `sqlite` reporter plus the queries that read it.
- A host that is not GitHub needs its own reporter and disposition source.

## Changes

- 2026-10-18: an adapter package holds each reporter that talks to an outside system, and the `json`
  reporter lives in the CLI.
- 2026-10-18: the `github` reporter writes its comments for a person, with no agent prompt block, no
  suggestion block and no model-written risk sentence. The risk level follows from the severities,
  the review's fields sit in collapsed blocks, and a confirmed fix edits its comment in place.
