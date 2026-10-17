# Reporters

A reporter sends a review's result to one destination. [0015](../../decisions/0015-reporters.md)
records the decision. Each reporter is an adapter package.

## Interface

```ts
type Reporter = {
  id: string;
  report: (result: ReviewResult, ctx: ReporterContext) => Promise<void>;
};

type DispositionSource = {
  id: string;
  readDispositions: (review: ReviewRef, ctx: ReporterContext) => Promise<Disposition[]>;
};
```

`ReviewResult` is the schema in `libs/contract`: the reviewed head, the base, the depth, the calls,
the findings and the failed calls. A reporter that fails logs the failure and never changes the
result that other reporters receive.

## Reporters

| Reporter  | Package            | Config                                       |
| --------- | ------------------ | -------------------------------------------- |
| `json`    | `apps/cli`         | `path`, or stdout                            |
| `github`  | `adapters/github`  | The App's installation, from the environment |
| `sqlite`  | `adapters/sqlite`  | `path` to the database file                  |
| `webhook` | `adapters/webhook` | `url`, and a header for a shared secret      |

The `github` adapter is both a reporter and a disposition source: it posts comments and the check
run, and it reads the typed replies in each thread. The `sqlite` reporter stores results and stores
the dispositions that a source returns.

## Order

noslop runs the reporters in the order the config lists them. The `github` reporter sets the check
run last, after every other reporter finishes, so the check never passes on a result that a store
failed to record.
