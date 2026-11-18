# review-and-fix

Review a pull request as the App on the claude adapter, answer its findings, push a fix, and see
`noslop review --fixes-only` confirm the fix and the `noslop` check pass. The journey takes the path
a user takes on a real pull request: a review, an answer that `noslop check` judges, a `fixed`
answer, and a fixes-only re-review.

Start the environment first: `bun verify up`, then `bun verify doctor`, as steps 2 and 3 of the
verify skill's Check a change say. Run the journey's lines in order. At the first line that exits
non-zero, run `bun verify action close-pull-request`, and count the feature as failed.

- `open-pull-request` pushes a change with 2 seeded defects to the sandbox: a stock move that drops
  its rollback, and an order query that builds SQL from a request value.
- `answer-findings --threads all-but-first` answers every finding thread but the first. When the
  review posts one thread, it answers none, and still exits 0.
- `push-fix` restores the rollback and binds the order status, which fixes both defects. The `fixed`
  answer goes to the first thread alone; the other threads hold their `not-a-defect` answer.

## Journey

```bash
bun verify use --feature review-and-fix
bun verify action open-pull-request --adapter claude
bun verify action review
bun verify check-run --conclusion failure
bun verify findings --open some
bun verify action answer-findings --disposition not-a-defect --threads all-but-first
bun verify action check
bun verify action push-fix
bun verify action answer-findings --disposition fixed --threads first
bun verify action review-fixes-only
bun verify check-run --conclusion success
bun verify findings --open none --fixed some
bun verify action close-pull-request
```

## End state

- Every command exits 0.
- After `review`, `data.findings` is above 0, the `noslop` check run on the head concludes
  `failure`, and `findings` lists some `open` findings in `data.states`.
- After `review-fixes-only`, `data.fixChecks` is above 0, the check run concludes `success`, and
  `findings` lists no `open` finding and some `fixed` ones.
- When `check-run --conclusion success` fails, the fix check judged the fix not to hold. Read the
  App's reply on the first thread of the pull request that `open-pull-request` printed in
  `data.url`, before `close-pull-request` closes it.
