# 0009: The merge loop

- Date: 2026-10-17
- Status: decided
- Updated: 2026-10-22

noslop posts as its own GitHub App. It posts each finding as an inline review comment and posts a
required check run. The check passes only when every finding, P3 included, has a disposition, on the
reviewed head.

The author answers in the finding's thread with a typed disposition, which the App parses. Free text
is not a disposition.

| Disposition              | Use                                                   |
| ------------------------ | ----------------------------------------------------- |
| `fixed <sha>`            | The fix is in that commit. The re-review confirms it  |
| `not-a-defect <reason>`  | The finding is wrong, with the reason                 |
| `deferred <issue>`       | The fix goes to an issue, which the App checks exists |
| `accepted-risk <reason>` | The owner accepts the risk                            |

A finding on a line that the pull request added or changed takes `fixed`, `not-a-defect` or
`accepted-risk`. `deferred` is allowed only for code the pull request did not write: a pre-existing
defect it exposes, a consumer in another repo, or a fix that needs another repo. For that code,
every security finding, every risk-class finding and every P1 blocks the merge.

A re-review covers only the files whose patch changed since the last review, and it confirms each
fix as fixed or not fixed. There is one re-check. A new finding after it becomes a follow-up issue,
unless it is a security finding or sits in code the pull request wrote. When the head moves, the App
reviews the files whose patch the push changed.

A later review drops a new finding that matches one the author answered `not-a-defect` on the same
pull request, so the author answers each finding once. A head whose every patch a review with no
failed call read gets a review of no file, so a rebase raises no finding again and is never refused.

## Why

- A record from the reviewer's own identity cannot be replaced by an author's summary.
- A gate that checks every answer stops findings from merging unanswered.
- Code written in the pull request is cheapest to fix in that pull request, so deferring it only
  moves the work.

## Alternatives

- **A disposition only for blocking findings.** Non-blocking findings go unanswered.
- **Deferral allowed by severity.** Authors defer every finding below the blocking line.
- **A summary in the pull request body.** The author writes it, so it can say the review found
  nothing when it did.

## Consequences

- Only the owner gives `accepted-risk`.
- Findings and dispositions go to the findings store, under [0012](0012-the-findings-store.md).

## Changes

- 2026-10-20: a later review drops a finding that matches one answered `not-a-defect`, and a head
  that a complete review covered gets a second review only in full.
- 2026-10-22: a re-review reads only the files whose patch changed since the last review, so a head
  with no changed patch gets a review of no file in place of a refusal.
