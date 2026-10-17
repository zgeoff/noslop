# The CLI

`@noslop/cli` ships the bin `noslop`. [0011](../../decisions/0011-model-adapters.md) records why the
CLI is versioned with JSON output.

## Commands

| Command                                       | Does                                                     |
| --------------------------------------------- | -------------------------------------------------------- |
| `noslop review [--base <ref>] [--head <ref>]` | Reviews the change between 2 commits in the current repo |
| `noslop review --pr <number>`                 | Reviews a pull request, from its base and head           |
| `noslop config`                               | Prints the merged config and the source of each key      |
| `noslop eval [--corpus <path>]`               | Replays a corpus through the current config              |
| `noslop store query <name>`                   | Runs a named query on the [findings store](store.md)     |

Each command takes `--json`, which runs the `json` reporter to stdout and prints nothing else.
`review` also runs every reporter in the config's `report` list, under [reporters](reporters.md).
Without `--json`, the command prints a summary for a person.

## JSON output

The JSON output of `review` holds:

- `version`: the output schema version.
- `head`, `base`: the commits reviewed.
- `depth`, `lenses`, `calls`: what ran, with the model, effort, tokens and duration of each call.
- `findings`: the list, in the [findings](findings.md) schema.
- `failedCalls`: the calls that failed, with the reason.

The output schema version changes only with a breaking change to the output, so a consumer pins a
CLI version and reads the same shape.

## Temp folders

A review writes only to its own temp folder under the user's cache directory, never under `/tmp`.
The CLI deletes the folder when the review ends, whether it passes or fails.
