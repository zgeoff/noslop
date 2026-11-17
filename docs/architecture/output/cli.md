# The CLI

The CLI, the bin `noslop` in `@noslop/cli`, is the composition root for a review: it reads the
config, builds the adapter and the reporters, runs the pipeline on one change, and hands the result
to each reporter. It reviews a local branch or a pull request, and its JSON output carries a schema
version, so other tools pin a CLI version and read one shape. [The GitHub App](./github-app.md) runs
its reviews and its check updates through this CLI. [0011](../../decisions/0011-model-adapters.md)
records why noslop is a versioned CLI with JSON output.

The npm package `@noslop/cli` holds a Bun bundle of the CLI and every workspace package it imports,
the [lens](../review/lenses.md) prompts included, so the workspace packages stay private. The bundle
leaves out oxc-parser, whose native build npm installs for the user's platform. The workspace runs
the CLI from its source.

The package's exports let code use the result schema, the checks and the posting of the CLI without
running the CLI as a process:

- The root export and `@noslop/cli/contract` hold the review result schema and its types.
- `@noslop/cli/verify` runs the check of [verifying a result](#verifying-a-result).
- `@noslop/cli/post` posts a result, as [posting a result](#posting-a-result) describes.
- `@noslop/cli/check` sets a pull request's check run, as `noslop check` does, or with `readOnly`
  returns the outcome and writes nothing, as [checking read-only](#checking-read-only) describes.

The `verify`, `post` and `check` exports take the App's keys or a token from the caller, never from
the process environment.

Bun builds the exports into a second bundle, which leaves zod out. The package depends on zod, so
npm installs it, and a caller's schemas and the package's declarations share one zod. The build then
runs tsdown, which writes each export's declarations with TypeScript's own emit and inlines the
types of the workspace packages they reach, so the published types import nothing but zod.

## Commands

| Command                                                                                | Does                                                                                     |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `noslop review [--base <ref>] [--head <ref>]`                                          | Reviews the change between 2 commits of the current repo                                 |
| `noslop review --pr <number> [--full] [--repo <owner/name>]`                           | Reviews a pull request, from its base and head                                           |
| `noslop review --pr <number> --fixes-only`                                             | Checks each `fixed` [answer](#listing-the-findings), with no review                      |
| `noslop findings --pr <number> [--repo <owner/name>]`                                  | Lists each finding of a pull request with its state, and writes nothing                  |
| `noslop verify <file>`                                                                 | Checks a review result against its pull request's head and the config on its base branch |
| `noslop post <file> [--no-verify]`                                                     | Posts a verified review result to its pull request as the App                            |
| `noslop check --pr <number> --repo <owner/name>`                                       | Sets a pull request's check run from the answers to its findings, with no review         |
| `noslop check --read-only --pr <number> --repo <owner/name>`                           | Prints a pull request's check outcome and writes nothing to GitHub                       |
| `noslop config`                                                                        | Prints the merged config and the files each key comes from                               |
| `noslop store query <name>`                                                            | Runs a named query on the [findings store](../measurement/store.md)                      |
| `noslop store escape --repo <owner/name> --issue <issue> --head <sha> --defect <text>` | Records a defect that a review missed                                                    |
| `noslop eval --corpus <path>`                                                          | Replays a corpus through the current config and scores it per lens                       |

`review` also takes these flags:

- `--report <ids>`, a comma-separated list of reporters that replaces the config's list;
- `--adapter codex|claude`, which replaces the config's adapter;
- `--push`, which marks the change as a direct push to the default branch, under
  [special changes](../review/routing-and-depth.md#special-changes).

`eval` takes flags that cap, compare, resume and replay a run: `noslop eval --help` lists them, and
[the eval harness](../measurement/eval.md) describes each one. `store query findings-by-pr` takes
`--repo`, `--pr` and `--since`, under
[findings by pull request](../measurement/store.md#findings-by-pull-request). Every command takes
`--json`, and `--verbose` lowers the log level to debug. `noslop <command> --help` lists each
command's flags.

Logs go to stderr, so stdout holds only a command's output. A command exits 0 when it completed. It
exits 1 in these cases:

- It could not run, such as on a bad flag, a git failure or an adapter the CLI does not have.
- `review` ran, and a reporter failed.
- `verify` or `post` refused the result.
- `findings` met a finding comment of the App whose [marker](./github-app.md#state-in-markers)
  noslop cannot read.
- `check --read-only` ran, and the check did not pass.

`check` without `--read-only` exits 0 whatever the check concludes, because its job is to set the
check run, and the check run carries the conclusion, as
[the check run](./github-app.md#the-check-run) describes.

## Choosing the change

Without `--pr`, `review` reviews the repo that holds the working directory, from `--base` to
`--head`. The head defaults to `HEAD`. The base defaults to the merge-base of the head with
`origin/HEAD`, then with `main`, then with `master`, so a branch's review covers what it changed
since it left the default branch. The title is the head commit's subject, and the body holds every
commit message of the change, oldest first, so the intent lens reads the whole branch and not only
its last commit.

With `--pr`, the CLI reads the pull request from GitHub and takes its title, body, head and base
from there, so it refuses `--base` and `--head`. The repo comes from `--repo`, or from the origin
remote's URL. The config comes from the tip of the pull request's base branch, under
[resolution](../config/review-config.md#resolution). The base is the merge-base of the pull
request's base and head.

A re-review, a review of a pull request that noslop reviewed before, reads the files that
[what a re-review reads](./re-review.md#what-a-re-review-reads) picks. In the common case, those are
the files whose patch changed since the last review. When the rule picks no file, the re-review
reads no file and exits 0. `--full` reads every file of the pull request again. `--fixes-only`
checks each `fixed` answer and raises no finding, under [the fixes-only run](./fixes-only-run.md).

## Output and reporters

With `--json`, `review` prints the review result as JSON to stdout and nothing else. Without it,
`review` prints a summary for a person: the depth, the lenses, each finding with its anchor, each
failed [call](../review/calls.md) and each file that no call read. A call is one model request for
one or more lenses.

Either way the CLI then runs every reporter in the report list, under [reporters](./reporters.md).
It skips a `json` reporter with no path set, because the command prints the result itself. The
built-in defaults list only the `json` reporter, with no path, so a bare `noslop review` with no
config prints the result and stores nothing.

The review result follows the result schema that `@noslop/cli/contract` exports, and the CLI parses
the result against it before printing it. The schema's version changes only with a breaking change
to the output. [Findings](../review/findings.md) covers the finding schema inside it.

## Verifying a result

A service that receives a review result from another developer's machine runs `verify` to check the
result before the service posts it. `verify` parses the result against the result schema, then reads
the result's pull request from GitHub and refuses the result unless both of these hold:

- The result reviews the pull request's current head, so a push after the review voids it.
- The result's config hash equals the hash of the config on the pull request's base branch. A push
  to the base branch, or to a parent config that the base branch's config extends, changes that
  hash, so `verify` refuses a review that ran under the config from before the push.

The CLI reads the commit the base branch points at, then loads that commit's config through GitHub's
contents API, with no checkout, so a push during the load cannot mix 2 commits. It loads the config
by the same rules a review loads a config by, so the 2 hashes match when the 2 configs match. Like a
review, it follows each symlink on a file's path, a link to a folder included. A rules file outside
the repo, which only the reviewer's machine holds, reads as missing, so a config that lists one
never verifies. When a symlink on a config file's path points outside the file's repo, `verify`
names that file, with the link and the link's target. `verify` exits 1 and prints each mismatch to
stderr.

## Posting a result

`post` posts a review result through the [GitHub reporter](./reporters.md) as the App: the findings,
the summary and the check run, as a review with `--report github` posts them. It verifies the result
first and posts nothing when the result fails.

A relay is a service your org hosts. It receives each developer's review result, verifies the result
and posts it as the App, and only the relay holds the App's keys. A relay that posts with `post`
posts only a review of the current head under the config on the base branch's tip.
[Enforce a review with a relay](../../guides/enforce-a-review-with-a-relay.md) sets one up.

`--no-verify` skips the verification, for a result the caller checked itself. `post` needs the App's
keys in the environment, and refuses to run with a token or an anonymous GitHub connection.

## Listing the findings

`findings` prints each finding the App posted on a pull request, with its id, its file, its
severity, its state and the login that wrote its latest answer. An answer is a person's reply to a
finding, in a form that [dispositions](./github-app.md#dispositions) describes. Each answer has one
of the kinds `fixed`, `not-a-defect`, `deferred` or `accepted-risk`. A merge gate outside noslop,
such as a required CI job, reads the list and decides from the `open` findings alone whether the
pull request may merge.

A finding with no answer is `open`. A finding whose latest answer `noslop check` accepts takes the
kind of that answer as its state, and is `open` otherwise. The list and `noslop check` share one set
of rules for an answer:

- A `deferred` answer must name an issue that exists.
- noslop refuses a `deferred` answer for code the change wrote.
- noslop refuses a `deferred` answer for a P1 finding, a security finding or a risk-class finding. A
  finding carries a [risk class](../review/findings.md#the-risk-class-on-a-finding) when the lines
  it cites sit in the paths of a risk class that the [static stage](../review/static-stage.md)
  marked.
- A re-review or the fixes-only run makes a fix check of each `fixed` answer, under
  [fix confirmation](./re-review.md#fix-confirmation). A `fixed` answer holds once a fix check
  confirmed it, and its finding stays `open` while the latest review still reports the finding.
- A `fixed <commit>` answer can name a commit that the pull request's head holds and the latest
  review's head does not. That answer stays `open` until a fix check confirms it, because no fix
  check has read the fix.
- A `fixed` answer stays `open` and unjudged when the latest fix check could not judge its fix, such
  as when the fix's code goes over the config's file limit, `thresholds.maxFileChars`.
- An `accepted-risk` answer holds only when its author has admin permission on the repo.

With `--json`, the list follows the finding list schema that `@noslop/cli/contract` exports. Each
finding holds the reason `noslop check` refuses its answer, or null when it accepts the answer, and
`unjudged`, which is true only for an open `fixed` answer that the fix check could not judge. For an
unjudged answer, the reason is why the fix check could not judge it, so a caller can quote it when
it asks the gate's owner to let the pull request merge. The text list prints the reason after each
unjudged finding.

`findings` trusts the App's comments as [checking read-only](#checking-read-only) trusts them, and
it writes nothing to GitHub. The App keeps its state in a hidden marker at the end of each of its
comments, under [state in markers](./github-app.md#state-in-markers). `findings` exits 1 and lists
nothing when a finding comment of the App holds a marker noslop cannot read, because a list without
that finding would show the gate one open finding too few.

## Checking read-only

`check --read-only` computes the outcome the check run would hold and writes nothing: no check run,
no App comment in response to a reply that holds no answer, and no answers in the store. A CI job
runs it with its own token, so the App's keys stay with the relay.

The CLI cannot tell from a token alone which App's comments to trust. So `check --read-only` trusts
the comments of the App that `github.app` names in the config on the base branch's tip. It loads
that config as [verifying a result](#verifying-a-result) loads it, and refuses to run when that
config names no App and the environment holds no App keys. It prints the title and each open
finding, and exits 1 unless the check passes.

Without the flag, `check` sets the check run as the App, and refuses to run with a token or an
anonymous GitHub connection.

## Folders

The CLI keeps 2 folders under the XDG base directories. When a variable is unset, empty or relative,
it falls back to `~/.cache` and `~/.local/share`, as the XDG base directory spec requires:

- The cache folder, `$XDG_CACHE_HOME/noslop`, holds each review's temp folder and the static stage's
  [base index](../review/static-stage.md#the-reuse-slice-and-the-base-index). A review writes only
  to its own temp folder there, never under `/tmp`, and the CLI deletes the folder when the review
  ends, whether it passes or fails.
- The data folder, `$XDG_DATA_HOME/noslop`, holds the findings store at `store.sqlite`, unless the
  config sets a path for the `sqlite` reporter. The store is durable data that other tools read, so
  it stays out of the cache, which a user may clear at any time.

## The config a command reads

`review` needs a git repo. Without `--pr`, it reads the `review.json` at the repo's root wherever in
the repo it runs, and with `--pr` it reads the config as [choosing the change](#choosing-the-change)
describes. `config`, `store query` and `eval` read the config of the repo that holds the working
directory, or of the working directory itself outside a repo.
