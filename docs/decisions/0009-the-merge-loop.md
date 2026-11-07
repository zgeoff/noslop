# 0009: The merge loop

- Date: 2026-10-17
- Status: decided
- Updated: 2026-11-07

noslop posts as its own GitHub App. It posts each finding as an inline review comment, and it sets a
check run named `noslop` that passes only when no finding is open. noslop never decides the merge. A
relay decides it: a service the repo's org runs, which reads the open findings and applies its own
rules, such as green CI, as
[enforce a review with a relay](../guides/enforce-a-review-with-a-relay.md) describes. A repo with
no relay can require the check in its branch rules.

A finding is open until someone replies in its thread with a valid disposition, a typed answer that
the App parses. The App answers a free-text reply with the accepted forms, and the finding stays
open. Every finding needs a disposition, whatever its severity, from P1, the highest, to P3.

| Disposition              | Use                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `fixed [<sha>]`          | The head no longer holds the defect. A fix check, a model call or a static rerun, must confirm it; the sha is a hint |
| `not-a-defect <reason>`  | The finding is wrong, with the reason                                                                                |
| `deferred <issue>`       | The fix goes to an issue that exists, or to an issue key that matches a pattern in the config's `issueKeys`          |
| `accepted-risk <reason>` | The reply's writer accepts the risk; the App counts it only when that writer is a repo admin                         |

`deferred` is valid only for code the pull request did not write:

- a pre-existing defect the pull request exposes;
- a consumer in another repo;
- a fix that needs another repo;
- a file the config marks synced, whose source is another repo.

Even for that code, `deferred` is never valid for a security finding, a P1, or a finding in a path
the config marks as a risk class. A finding on a line the pull request wrote takes `fixed`,
`not-a-defect` or `accepted-risk`.

When the head moves, the App reviews only the files whose patch changed since the last review, and
each review posts its new findings on the pull request. A push that changes no patch, such as a
clean rebase, therefore gets a review that reads no file and posts no finding. A later review also
drops each new finding that matches one the author answered `not-a-defect`, under
[findings answered not-a-defect](../architecture/review/findings.md#findings-answered-not-a-defect),
so the author answers each finding once.

## Why

- The App posts under its own identity, so the author cannot replace its record with a summary of
  their own.
- The check needs an answer to every finding, so a relay or a branch rule can stop a pull request
  that leaves a finding unanswered.
- The check reads only the findings and their dispositions, so it means the same in every repo. The
  relay knows the repo's merge policy, such as a noslop review of each new head commit, and noslop
  does not.
- Code written in the pull request is cheapest to fix in that pull request, so deferring it only
  moves the work.

## Alternatives

- **A disposition only for P1 and P2 findings.** P3 findings go unanswered.
- **Deferral allowed by severity.** Authors defer every finding below the severity that needs an
  answer.
- **A summary in the pull request body.** The author writes it, so it can say the review found
  nothing when it did.

## Consequences

- Only a repo admin can accept a risk, so an author with write access alone must fix or answer the
  finding another way.
- Findings and dispositions go to the findings store, under [0012](0012-the-findings-store.md).

## Changes

- 2026-10-20: a later review drops a finding that matches one answered `not-a-defect`, and a head
  that a complete review covered gets a second review only in full.
- 2026-10-22: a re-review reads only the files whose patch changed since the last review, so a head
  with no changed patch gets a review of no file in place of a refusal.
- 2026-11-05: a finding in a file the config marks synced counts as code the pull request did not
  write, so it can take `deferred`.
- 2026-11-06: a deferral can name a key of another tracker that a pattern in the config matches, and
  noslop takes the key as an existing issue with no lookup.
- 2026-11-07: the check means only that no finding is open, and a relay decides the merge. noslop
  counts no reviews and files no follow-up issue.
