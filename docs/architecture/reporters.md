# Reporters

A review produces one result, and each reporter sends that result to one destination. The config's
`report` list names the reporters a review runs, and `noslop review --report <ids>` replaces the
list for one run. Every reporter receives the same result, so the destinations never disagree about
what a review found. noslop ships four reporters: `json`, `sqlite`, `webhook` and `github`. The
`github` reporter runs after all the others and sees which of them failed, so the check run it sets
never passes on a result that another destination failed to record.
[0015](../decisions/0015-reporters.md) records the decision.

[The findings store](./store.md) covers what the `sqlite` reporter writes, and
[the GitHub App](./github-app.md) covers what the `github` reporter posts and how its check run
passes.

## The result and the reporter

The review result is the schema in the contract library: the repo, the pull request when there is
one, the base and the head, the depth, the lenses that ran, each call, each finding and each failed
call. [Findings](./findings.md) covers the finding inside it. The result carries a version number
that changes only with a breaking change to its shape, so a consumer that pins a CLI version reads
one shape.

A reporter is an adapter that takes the result and a context. The context holds the logger, the
reporter's own options from the config's `reporters` map, and the ids of the reporters that failed
before it. The command line composes the reporters, so the review module never imports one.

## The four reporters

- `json` writes the result as JSON to the file its `path` option names. With no `path`, the review
  command leaves the reporter out, because the command prints the result to stdout itself: a
  summary, or the full JSON under `--json`.
- `sqlite` records the review in the findings store, at its `path` option or in the user's data
  folder.
- `webhook` sends the result as JSON in a POST to its `url` option. With `secretHeader` set, the
  request carries that header, holding the value of the environment variable that `secretEnv` names,
  so the secret stays out of the config file. An answer outside the success range counts as a
  failure.
- `github` posts the findings and the summary on the pull request and sets the `noslop` check run.
  It needs a pull request, so it fails on a review of a local range that `--pr` did not name.

The built-in defaults list only `json`, so a review with no config prints its result and writes
nothing else.

## Order and failure

The reporters run one at a time in the order the list gives, with one exception: a reporter marked
to run last runs after every other, wherever the list puts it. `github` is that reporter, because
its check run gates the merge on the other destinations. A reporter that throws is logged and
recorded as failed, and the next reporter still runs. An id that matches no reporter noslop has
counts as failed in the same way. Each reporter receives the failures so far, and the check run
fails when any reporter before it failed.

The review command exits 1 when any reporter failed, so a script that runs a review sees the lost
write even when the review itself passed.

## Dispositions

Dispositions travel the other way, from a host back to noslop. The contract defines a disposition
source for that direction, and the GitHub adapter implements one that reads the typed replies in the
finding threads. The GitHub reporter and the check read those replies directly, and `noslop check`
reads them through the source and records them in [the findings store](./store.md).
