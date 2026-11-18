# review-on-codex

Review a pull request on the codex adapter, against a live codex CLI. The noslop GitHub App posts
findings, and its `noslop` check run on GitHub fails while they stay open. The journey checks only
the codex adapter: a change elsewhere marks [review-and-fix](feature-review-and-fix.md) as changed,
and that journey covers the answers and the fixes-only re-review.

The mistake that costs the most time:

- **Reporting a failure after one run with 0 findings.** codex's output varies between runs. When
  `review` reports 0 findings, close the pull request and run the journey once more from its first
  line. Report the feature as failed only when the second run also misses.

`open-pull-request --adapter codex` pushes a change with 2 seeded defects, and a `review.json` that
picks codex for each review on this pull request. The seed lives in
[`sandbox-seed.ts`](../../../../scripts/verify/sandbox-seed.ts).

## Journey

```bash
bun verify use --feature review-on-codex
bun verify action open-pull-request --adapter codex
bun verify action review
bun verify check-run --conclusion failure
bun verify findings --open some
bun verify action close-pull-request
```

## End state

Each row's fields sit in the command's `data`. Judge the review by these counts and states alone.

| Command                          | The feature works when                                    |
| -------------------------------- | --------------------------------------------------------- |
| `action review`                  | `findings` is above 0                                     |
| `check-run --conclusion failure` | it exits 0: the check run on the head commit is `failure` |
| `findings --open some`           | it exits 0, and `states` counts some `open` findings      |
