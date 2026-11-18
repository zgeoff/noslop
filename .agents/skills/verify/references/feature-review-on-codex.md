# review-on-codex

Review a pull request on the codex adapter against a live codex CLI. The noslop GitHub App posts
findings on 2 seeded defects, and its `noslop` check run on GitHub fails until someone answers them.
Answering findings and the fixes-only re-review run the same code on either adapter, so
[review-and-fix](feature-review-and-fix.md) covers them.

Start a run first, with steps 2 and 3 of [Check a change](../SKILL.md#check-a-change). When a
journey line exits non-zero, read the pull request before you close it: `open-pull-request` printed
its link in `data.url`. Then run `bun verify action close-pull-request`, skip `done`, and report the
line and its `error.code`.

`open-pull-request --adapter codex` pushes a change with a stock move that drops its rollback, and
an order query that builds SQL from a request value. Its `review.json` picks codex, so `review` runs
codex. The branches belong to the run alone, so no other journey reads that `review.json`.

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

Each command prints a JSON envelope, and the fields below sit in its `data`:

| Command                          | Shows the feature works when                              |
| -------------------------------- | --------------------------------------------------------- |
| `action review`                  | `findings` is above 0                                     |
| `check-run --conclusion failure` | it exits 0: the check run on the head commit is `failure` |
| `findings --open some`           | it exits 0, and `states` counts some `open` findings      |

When `review` reports 0 findings, codex missed both seeded defects. Run the journey once more before
you report the feature as failed: the model's output varies between runs.
