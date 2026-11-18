# review-and-fix

Run a user's whole path through a pull request on the claude adapter, with the journey's actions in
the author's place. The noslop GitHub App reviews the pull request and posts findings. The actions
answer the findings and push a fix. Then a fixes-only re-review confirms the fix, and the App's
`noslop` check run on GitHub turns green.

The mistakes that cost the most time:

- **Judging the review by its words.** claude words its findings anew on each run. Judge it by the
  counts and states in the End state table alone.
- **Blaming the fix check for a red check run.** When `check-run --conclusion success` fails, read
  the App's comments first. A thread with no answer, or an answer that `noslop check` refused, also
  keeps the check run red.

## What the journey sets up

- `open-pull-request --adapter claude` pushes a change with 2 seeded defects, and a `review.json`
  that picks claude for each review on this pull request. The seed, the defects and the fix live in
  [`sandbox-seed.ts`](../../../../scripts/verify/sandbox-seed.ts).
- `--threads first` means the App's finding thread with the lowest comment ID. `all-but-first` means
  each other thread, and answers none when the review posts one thread.
- The `not-a-defect` answers leave the first thread open, so `action check`, which runs
  `noslop check` with no model call, keeps the check run failing.
- `push-fix` fixes both seeded defects, and the `fixed` answer on the first thread names its commit.

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

Each row's fields sit in the command's `data`. A line that exits 0 but misses its row counts as a
failed line.

| Command                             | The feature works when                                                  |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `action review`                     | `findings` is above 0                                                   |
| `check-run --conclusion failure`    | it exits 0: the check run on the head commit is `failure`               |
| `findings --open some`              | it exits 0, and `states` counts some `open` findings                    |
| `action review-fixes-only`          | `fixChecks` is above 0                                                  |
| `check-run --conclusion success`    | it exits 0: the check run on the new head is `success`                  |
| `findings --open none --fixed some` | it exits 0, and `states` counts some `fixed` findings and no `open` one |
