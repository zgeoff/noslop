# The findings store

The findings store is one SQLite file that records every review noslop runs, with each call and each
finding of the review, beside the dispositions people gave and the escapes. An escape is a defect
that a review missed, recorded from the issue that reported it. The `sqlite` reporter writes a
review into the store, and the store's named queries turn the rows into measures per lens: yield,
noise, recall, and cost. Other tools read the store only through `noslop store query <name> --json`
and keep no copy, so its tables can change without breaking a reader.
[0012](../../decisions/0012-the-findings-store.md) records the decision, and
[0015](../../decisions/0015-reporters.md) makes the store a reporter.

[Reporters](../output/reporters.md) covers when the `sqlite` reporter runs, and
[findings](../review/findings.md) covers what a finding holds and how its id is formed.

## Where the store lives

The store sits at the `path` option of the `sqlite` reporter in the config, or in the noslop folder
under the user's XDG data folder when the config names none. The query command resolves the path the
same way from the same config, so it reads the file the reporter writes.

Opening the store creates the file and its folder when they are missing, then applies each migration
the file lacks, so a newer CLI upgrades an older store the first time it opens it. A migration that
fails closes the store and fails the command. The store runs through Bun's SQLite driver behind
Kysely, in SQLite's WAL mode with foreign keys enforced, and each command closes it when done.

## What the store records

The store holds one row per review, per call, per finding, per dropped finding, per disposition and
per escape. A list or an object sits in its column as JSON text, and a boolean as 0 or 1.

- A review row keeps the repo, the pull request when there is one, the base and the head, the depth,
  the lenses that ran, the config hash and the start and end time.
- A call row keeps its lenses, depth, adapter, model, effort, attempts, status, duration, and its
  new input, cached input, cache write and output tokens. Deleting a review deletes its calls,
  findings and dropped findings with it.
- A finding row keeps every field of the finding, plus the depth, model and effort of the call that
  reported it, so a measure can split one lens by how it ran. Every finding row holds its lens, so
  yield, noise and recall count per lens. A finding that no call reported, such as one from the
  static stage, takes the review's depth and no model.
- A dropped finding row keeps a finding that Assemble dropped: its lens, call, title, anchor and
  criterion, the reason it was dropped, and the rules file and quote a taste finding gave. The rows
  let a reader check whether a finding rule throws away real findings.
- A disposition row keeps the repo and the finding id, the kind and its value, the author and
  whether the author owns the repo, the source it came from and its time. A finding id is unique
  only within one repo, so the repo is part of the key. A disposition the store holds already, from
  the same source at the same time, is kept as it is, so reading one thread twice records it once.
- An escape row keeps the issue that reported a defect, the repo and head of the change that caused
  it, the lens that should have caught it, and the location when it is known.

The reporter writes a review, its calls, its findings and its dropped findings in one transaction,
so a reader never sees a review without its findings. A finding id leaves out the line numbers, so
two reviews of one change that report one defect share the id, and the queries count the defect
once.

Three writers fill the store. The `sqlite` reporter writes each review. `noslop check` writes the
dispositions of a pull request each time it sets the check, so every reply the App sees reaches the
yield and noise counts. `noslop store escape` writes an escape from the issue that reports the
defect and the head of the change that caused it. A review reads the escaped files of its repo back
from the store as its past-escape signal.

## The queries

Each finding of a repo has one outcome: the kind of its latest disposition, or open when it has
none. A review that ends after a `fixed` disposition and still reports the finding reopens it, so a
fix the next review disproves never counts as yield.

- `yield-by-lens` gives, per lens, the findings, how many ended `fixed`, `not-a-defect` or open, and
  the share that ended `fixed` (the yield) and `not-a-defect` (the noise).
- `yield-by-depth` gives the same counts per depth. A finding counts at the depth of the first
  review that reported it, since a later review of a fixed change can run at another depth.
- `open-findings` lists each open finding of each change's latest review, the most severe first. A
  pull request is one change, and a local branch with no pull request is one change per base.
- `cost-by-depth` gives, per depth, the calls, the failed calls, the tokens and the mean duration.
- `recall-by-lens` gives, per lens, the escapes, how many of them came from a change the lens ran
  on, and how many of those changes got a finding from the lens on the escape's file. A lens ran on
  a change when the review lists it or one of the review's calls carried it, because the review
  lists only the lenses that routing picks, and the design lens shows only in its call.
- `recall-by-depth` gives the same counts per depth, from the latest review of the change that
  caused each escape. An escape on a change that no review saw counts under no depth.
- `dropped-findings` lists each dropped finding with its review's repo, pull request and head, the
  reason, and the rules file and quote, the newest review first.
- `findings-by-pr` lists each finding of each pull request once, with its latest disposition, under
  [findings by pull request](#findings-by-pull-request).

The query command prints the rows as text, or as JSON under `--json`. A query's row shape changes
only with a CLI version, so a reader that pins the version reads one shape.

## Findings by pull request

`noslop store query findings-by-pr [--repo <owner/name>] [--pr <number>] [--since <iso>] --json`
gives a check-in or an audit every finding of a pull request with its latest reply, so the reader
needs no knowledge of the store's tables. The query reads only reviews of a pull request, so a local
branch's review adds no row. Each flag narrows the reviews the query reads: `--repo` to one repo,
`--pr` to one pull request number, and `--since` to the reviews that ended at or after that time.
The CLI turns a `--since` time into UTC before the query compares it with the store's times, and it
refuses these flags on every other query.

The query returns one row per finding of a pull request. When several reviews of the pull request
report one finding, the row takes the head, location, severity and title from the latest of them.
The disposition fields hold the latest reply in the finding's thread as given, so a `fixed` finding
that a later review reports again stays `fixed` here, where `open-findings` counts it open. The rows
come sorted by repo, pull request, severity, path and line. Under `--json`, the command prints an
array of rows of this shape:

| Field              | Type             | Holds                                                         |
| ------------------ | ---------------- | ------------------------------------------------------------- |
| `repo`             | string           | The repo as owner/name                                        |
| `pullRequest`      | number           | The pull request number                                       |
| `head`             | string           | The head commit of the latest review that reported it         |
| `id`               | string           | The finding id, 16 hex characters                             |
| `path`             | string           | The file the finding anchors to                               |
| `startLine`        | number           | The first line of the anchor                                  |
| `severity`         | string           | The severity, `P1` to `P3`                                    |
| `lens`             | string           | The lens that reported it                                     |
| `rule`             | string or `null` | The rules file a taste finding quoted; `null` for other kinds |
| `title`            | string           | The finding's title                                           |
| `dispositionKind`  | string or `null` | The kind of the latest disposition; `null` with no reply      |
| `dispositionValue` | string or `null` | The latest disposition's commit, issue or reason              |

The store keeps no id of a finding's comment, so a row holds no link to it.
