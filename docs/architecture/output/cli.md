# The CLI

The CLI, the bin `noslop` in `@noslop/cli`, is the composition root for a review: it reads the
config, builds the adapter and the reporters, runs the pipeline on one change, and hands the result
to each reporter. It reviews a local branch or a pull request, and its JSON output carries a schema
version, so other tools pin a CLI version and read one shape. [The GitHub App](./github-app.md) runs
its reviews and its check updates through this CLI. [0011](../../decisions/0011-model-adapters.md)
records why noslop is a versioned CLI with JSON output.

The npm package `@noslop/cli` holds one Bun bundle of the CLI and every workspace package it
imports, the lens prompts included, so the workspace packages stay private. The bundle leaves out
oxc-parser, whose native build npm installs for the user's platform. The workspace runs the CLI from
its source.

The package's library entries hold what code can import from it: the root export,
`@noslop/cli/contract` with the review result schema and its types, so code that does not shell out
reads results through the same contract, and `@noslop/cli/verify`, which runs the check of
[verifying a result](#verifying-a-result) for a caller that passes the App's keys. They leave zod to
npm, so a caller's schemas and the package's declarations share one zod. tsdown writes each entry's
declarations with TypeScript's own emit and inlines the types of the workspace packages they reach,
so the published types import nothing but zod.

## Commands

| Command                                                      | Does                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `noslop review [--base <ref>] [--head <ref>]`                | Reviews the change between 2 commits of the current repo               |
| `noslop review --pr <number> [--full] [--repo <owner/name>]` | Reviews a pull request, from its base and head                         |
| `noslop verify <file>`                                       | Checks a review result against its pull request's head and base config |
| `noslop check --pr <number> --repo <owner/name>`             | Sets a pull request's check run from its dispositions, with no review  |
| `noslop config`                                              | Prints the merged config and the file each key comes from              |
| `noslop store query <name>`                                  | Runs a named query on the [findings store](../measurement/store.md)    |
| `noslop store escape --repo --issue --head --defect`         | Records a defect that a review missed                                  |
| `noslop eval --corpus <path>`                                | Replays a corpus through the current config and scores it per lens     |

`review` also takes `--report <ids>`, a comma-separated list of reporters that replaces the config's
list, `--adapter codex|claude`, which replaces the config's adapter, and `--push`, which reviews a
direct push to the default branch. `eval` takes `--limit`, `--baseline`, `--noise-floor`, `--out`,
`--adapter`, `--resume`, `--static` and `--depth`, under [the eval harness](../measurement/eval.md).
Every command takes `--json`, and `--verbose` lowers the log level to debug.
`noslop <command> --help` lists each command's flags.

Logs go to stderr, so stdout holds only a command's output. A command exits 0 when it completed. It
exits 1 when it could not run, such as on a bad flag, a git failure or an adapter the CLI does not
have, and `review` exits 1 when any reporter fails. `check` exits 0 whatever the check concludes,
because its job is to set the check run, and the check run carries the conclusion.

## Choosing the change

Without `--pr`, `review` reviews the repo that holds the working directory, from `--base` to
`--head`. The head defaults to `HEAD`. The base defaults to the merge-base of the head with
`origin/HEAD`, then with `main`, then with `master`, so a branch's review covers what it changed
since it left the default branch. The title is the head commit's subject, and the body holds every
commit message of the change, oldest first, so the intent lens reads the whole branch and not only
its last commit.

With `--pr`, the CLI reads the pull request from GitHub and takes its title, body, head and base
from there, so it refuses `--base` and `--head`. The repo comes from `--repo`, or from the origin
remote's URL. The base is the merge-base of the pull request's base and head. One exception: a
re-review starts from the reviewed head of the last fully completed review, under the rule in
[re-review and fix confirmation](./github-app.md#re-review-and-fix-confirmation). `--full` keeps the
merge-base as the base, so the review covers the whole pull request again, such as to confirm a fix
whose commit an earlier delta left out.

## Output and reporters

With `--json`, `review` prints the review result as JSON to stdout and nothing else. Without it,
`review` prints a summary for a person: the depth, the lenses, each finding with its anchor, and
each failed call. Either way the CLI then runs every reporter in the report list, under
[reporters](./reporters.md). The `json` reporter with no path set is left out, because the command
prints the result itself, so a bare `noslop review` with the built-in defaults prints the result and
stores nothing.

The review result follows the result schema in the contract package, and the CLI parses the result
against it before printing it. The schema's version changes only with a breaking change to the
output, so a consumer that pins a CLI version reads the same shape.
[Findings](../review/findings.md) covers the finding schema inside it.

## Verifying a result

`verify` lets a service that receives a review result from someone else's machine trust it before it
posts it. It parses the result against the result schema, then reads the result's pull request from
GitHub and refuses the result unless both of these hold:

- The result reviews the pull request's current head, so a push after the review voids it.
- The result's config hash equals the hash of the config on the pull request's base branch, so
  `verify` refuses a review that ran under any other config, such as one that a later change to the
  base branch or to the parent config it extends has replaced.

The CLI loads the base branch's config through GitHub's contents API, with no checkout, by the same
rules a review loads a config by, so the 2 hashes match when the 2 configs match. A rules file
outside the repo, which only the reviewer's machine holds, reads as missing, so a config that lists
one never verifies. `verify` exits 1 and prints each mismatch to stderr.

## Folders

The CLI keeps 2 folders under the XDG base directories, and falls back to the folders under the home
directory when a variable is unset, empty or relative, as the XDG base directory spec requires:

- The cache folder, `$XDG_CACHE_HOME/noslop`, holds each review's temp folder and the static stage's
  base index. A review writes only to its own temp folder there, never under `/tmp`, and the CLI
  deletes the folder when the review ends, whether it passes or fails.
- The data folder, `$XDG_DATA_HOME/noslop`, holds the findings store at `store.sqlite`, unless the
  config sets a path for the `sqlite` reporter. The store is durable data that other tools read, so
  it stays out of the cache, which a user may clear at any time.

`review` needs a git repo, and reads the `review.json` at the repo's root wherever in the repo it
runs. `config`, `store query` and `eval` read the config of the repo that holds the working
directory, or of the working directory itself outside a repo.
