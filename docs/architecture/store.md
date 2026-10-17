# The findings store

noslop keeps one SQLite file that records every review it runs, with each call and each finding of
the review, beside the dispositions people gave and the escapes that got past it. The `sqlite`
reporter writes a review into the store, and the store's named queries turn the rows into measures
per lens: yield, noise, recall, and cost. Other tools read the store only through
`noslop store query <name> --json` and keep no copy, so its tables can change without breaking a
reader. [0012](../decisions/0012-the-findings-store.md) records the decision, and
[0015](../decisions/0015-reporters.md) makes the store a reporter.

[Reporters](./reporters.md) covers when the `sqlite` reporter runs, and [findings](./findings.md)
covers what a finding holds and how its id is formed.

## Where the store lives

The store sits at the `path` option of the `sqlite` reporter in the config, or in the noslop folder
under the user's XDG data folder when the config names none. The query command resolves the path the
same way from the same config, so it reads the file the reporter writes.

Opening the store creates the file and its folder when they are missing, then applies each migration
the file lacks, so a newer CLI upgrades an older store the first time it opens it. A migration that
fails closes the store and fails the command. The store runs through Bun's SQLite driver behind
Kysely, in SQLite's WAL mode with foreign keys enforced, and each command closes it when done.

## What the store records

The store holds one row per review, per call, per finding, per disposition and per escape. A list or
an object sits in its column as JSON text, and a boolean as 0 or 1.

- A review row keeps the repo, the pull request when there is one, the base and the head, the depth,
  the lenses that ran, the config hash and the start and end time.
- A call row keeps its lenses, depth, adapter, model, effort, attempts, status, tokens and duration.
  Deleting a review deletes its calls and findings with it.
- A finding row keeps every field of the finding, plus the depth, model and effort of the call that
  reported it, so a measure can split one lens by how it ran. A finding that no call reported, such
  as one from the static stage, takes the review's depth and no model.
- A disposition row keeps the finding id, the kind and its value, the author and whether the author
  owns the repo, the source it came from and its time. A disposition the store holds already, from
  the same source at the same time, is kept as it is, so reading one thread twice records it once.
- An escape row keeps the issue that reported a defect, the repo and head of the change that caused
  it, the lens that should have caught it, and the location when it is known.

The reporter writes a review, its calls and its findings in one transaction, so a reader never sees
a review without its findings. A finding id leaves out the line numbers, so two reviews of one
change that report one defect share the id, and the queries count the defect once.

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
- `open-findings` lists each open finding of each change's latest review, the most severe first. A
  pull request is one change, and a local branch with no pull request is one change per base.
- `cost-by-depth` gives, per depth, the calls, the failed calls, the tokens and the mean duration.
- `recall-by-lens` gives, per lens, the escapes, how many of them came from a change the lens ran
  on, and how many of those changes got a finding from the lens on the escape's file.

The query command prints the rows as text, or as JSON under `--json`. A query's row shape changes
only with a CLI version, so a reader that pins the version reads one shape.
