# review-and-fix

Run a user's whole path through a pull request on the claude adapter. The noslop GitHub App reviews
the pull request and posts findings. The author answers them and pushes a fix. Then a fixes-only
re-review confirms the fix, and the App's `noslop` check run on GitHub turns green.

Start a run first, with steps 2 and 3 of [Check a change](../SKILL.md#check-a-change). When a
journey line exits non-zero, read the pull request before you close it: `open-pull-request` printed
its link in `data.url`. Then run `bun verify action close-pull-request`, skip `done`, and report the
line and its `error.code`.

What the journey sets up, and why:

- `open-pull-request --adapter claude` pushes a change with 2 seeded defects to the sandbox: a stock
  move that drops its rollback, and an order query that builds SQL from a request value. Its
  `review.json` picks claude, so each later review runs claude.
- `answer-findings --disposition not-a-defect --threads all-but-first` answers each finding thread
  but the one with the lowest comment ID. noslop accepts a `not-a-defect` answer from the author, so
  the `check` action, which runs `noslop check`, sets the check run from those answers alone. The
  one thread left open keeps the check run failing. When the review posts one thread, this line
  answers none, and still exits 0.
- `push-fix` restores the rollback and binds the order status, which fixes both defects. Then
  `answer-findings --disposition fixed --threads first` answers that first thread with the fix's
  commit.

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

Each command prints a JSON envelope, and the fields below sit in its `data`:

| Command                             | Shows the feature works when                                            |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `action review`                     | `findings` is above 0                                                   |
| `check-run --conclusion failure`    | it exits 0: the check run on the head commit is `failure`               |
| `findings --open some`              | it exits 0, and `states` counts some `open` findings                    |
| `action check`                      | it exits 0; the check run stays `failure`                               |
| `action review-fixes-only`          | `fixChecks` is above 0                                                  |
| `check-run --conclusion success`    | it exits 0: the check run on the new head is `success`                  |
| `findings --open none --fixed some` | it exits 0, and `states` counts some `fixed` findings and no `open` one |

When `check-run --conclusion success` fails, the fixes-only re-review judged the fix not to hold.
Its reply on the first finding thread gives the reason: quote it in your report.
