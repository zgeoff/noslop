# review-on-codex

Review a pull request as the App on the codex adapter, and see findings and a failing `noslop`
check. The journey checks the codex adapter against a live codex CLI. The answers and the fixes-only
re-review run the same code on either adapter, and `review-and-fix` covers them.

Start the environment first: `bun verify up`, then `bun verify doctor`, as steps 2 and 3 of the
verify skill's Check a change say. Run the journey's lines in order. At the first line that exits
non-zero, run `bun verify action close-pull-request`, and count the feature as failed.

`open-pull-request --adapter codex` writes a `review.json` that picks codex on the pull request's
base branch, so `review` runs codex.

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

- Every command exits 0.
- After `review`, `data.findings` is above 0, the `noslop` check run on the head concludes
  `failure`, and `findings` lists some `open` findings in `data.states`.
