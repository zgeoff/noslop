# The GitHub App

The App posts a review's findings and gates the merge.
[0009](../../decisions/0009-the-merge-loop.md) records the merge loop.

## What it posts

1. One pull request review that holds an inline comment per finding, at its anchor. A comment holds
   the title, the body, the severity, the verdict, the fact a PLAUSIBLE finding rests on, and the
   finding `id`.
2. A summary comment with the depth, the lenses that ran, and any failed call.
3. A check run named `noslop`, required by the branch rules.

## The check run

The check passes when all 3 hold:

1. The check ran on the current head.
2. No call failed.
3. Every finding holds a valid disposition.

Otherwise it fails, and its text lists each finding with no valid disposition.

## Dispositions

The author replies in the finding's thread. The reply's first line is the disposition:

```text
fixed 1a2b3c4
not-a-defect the caller already holds the lock: src/queue/claim.ts:41
deferred #123
accepted-risk single-tenant deploy; no shared rows
```

| Disposition              | Valid when                                                                        |
| ------------------------ | --------------------------------------------------------------------------------- |
| `fixed <sha>`            | The commit is on the branch and the re-review finds no finding with the same `id` |
| `not-a-defect <reason>`  | The reason is not empty                                                           |
| `deferred <issue>`       | The finding has `writtenByChange: false`, and the issue exists                    |
| `accepted-risk <reason>` | The reply's author is a repo owner, and the reason is not empty                   |

A reply in any other form is not a disposition, and the App answers with the accepted forms. For
code the change did not write, a `deferred` reply on a security finding, a risk-class finding or a
P1 is not valid.

## Re-review

When the head moves, the App reviews the commits since the reviewed head:

1. It confirms each `fixed` finding as fixed or not fixed.
2. It reports findings in the new commits.

The App runs one re-check. A finding that a later run reports becomes an issue, unless it is a
security finding or has `writtenByChange: true`.
