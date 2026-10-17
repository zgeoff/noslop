# The reviewer config

A repo's noslop config is `review.json` at the repo root.
[0010](../../decisions/0010-the-reviewer-config.md) records the decision. The zod schema lives in
`libs/contract`.

## Resolution

1. noslop starts from the built-in defaults.
2. It walks the `extends` chain from the root parent down to the repo's own file, and merges each
   file over the result so far.
3. Objects merge by key, arrays replace, and `null` removes an inherited key.

An `extends` value is a path relative to the file, or `github:<owner>/<repo>[/<path>][@<ref>]`. A
remote parent is fetched read-only and cached per ref. A cycle in the chain fails the load.

## Shape

```json
{
  "extends": "github:example/noslop-config",
  "rules": "./patterns.md",
  "adapter": "codex",
  "riskClasses": {
    "auth": { "paths": ["src/auth/**"], "forces": ["security"] },
    "migrations": { "paths": ["**/migrations/**"], "forces": ["concurrency-and-data-integrity"] }
  },
  "stack": {
    "writes": { "calls": ["insertInto", "updateTable", "deleteFrom"] },
    "io": { "imports": ["bun:sqlite", "node:child_process"] },
    "procedures": { "calls": [".handler"] }
  },
  "lenses": {
    "security": { "effort": "high" },
    "reuse": { "model": "small" }
  },
  "calls": {
    "A": ["correctness", "failure-handling-and-observability", "concurrency-and-data-integrity"]
  },
  "thresholds": { "lightMaxLines": 50, "docsMinLines": 100, "chunkLines": 150 }
}
```

| Key           | Holds                                                                        |
| ------------- | ---------------------------------------------------------------------------- |
| `extends`     | The parent config                                                            |
| `rules`       | The rules file, under [your own rules](your-own-rules.md)                    |
| `adapter`     | The default adapter ID                                                       |
| `riskClasses` | Each class: path globs, an optional detector ID, and the lenses it forces on |
| `stack`       | Stack patterns for the static stage                                          |
| `lenses`      | Per-lens overrides: `enabled`, `model`, `effort`                             |
| `calls`       | The call grouping, which replaces the default grouping per call ID           |
| `thresholds`  | The tuning values of routing and depth                                       |
| `consumers`   | Repos whose code the cross-repo lens reads, and how                          |

## Built-in defaults

With no `review.json`, noslop runs every generic lens, the default call grouping, the default
thresholds, and these risk classes: auth, secrets, money, migrations, deletion and infra
permissions. Each default class carries default path globs and detectors. No rules file loads, so
the taste lenses check only generic concerns.

## Effort and model per lens

The depth sets the default effort: `low` at Light, `medium` at Standard, `high` at Deep. A lens
override replaces that default. A call runs at the highest effort among its fired lenses. Fired
lenses that ask for different models split into separate calls.
