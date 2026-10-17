# Adapters

An adapter runs a call on one model CLI. [0011](../../decisions/0011-model-adapters.md) records the
decision. Each adapter is a package under `adapters/`.

## Interface

```ts
type ReviewAdapter = {
  id: string;
  runCall: (call: CallRequest, ctx: AdapterContext) => Promise<CallResult>;
};
```

- `CallRequest` holds the prompt, the output schema, the effort (`low`, `medium` or `high`), the
  model, the working directory and the timeout.
- `CallResult` holds the parsed output, the token counts, the duration and the CLI's exit status.
- `AdapterContext` holds the temp folder and the logger.

The adapter validates the output against the schema. Output that fails the schema is a failed call,
never a partial result.

## Structured output

Each call returns its findings as one JSON document that matches the call's output schema, through
the CLI's own schema flag. noslop validates the document, and Assemble applies the finding rules to
each finding.

An MCP server that noslop runs, with a `report_finding` tool, is the tier 2 path. The model lodges
each finding as it finds it, and noslop validates each one at once and returns the reason for a
rejection, so the model can fix it. The tool runs in noslop's process, outside the CLI's sandbox.
Lodged findings and structured output share one validation path. noslop adds the tool when the eval
corpus shows that Assemble drops findings for a bad anchor, a missing second location or an unknown
rule.

## Read-only configuration

Each adapter starts its CLI read-only, in its own code:

- The working directory is a detached worktree of the reviewed head.
- The CLI's sandbox allows no writes to the worktree and no network beyond the model provider.
- The CLI runs no tests and no repo scripts.
- Secret files the config names are outside the worktree the CLI sees.

## Codex

The Codex adapter runs `codex exec --sandbox read-only --output-schema <schema-file>` with the
prompt on stdin. It maps `low`, `medium` and `high` onto `model_reasoning_effort` through `-c`. It
appends noslop's instructions to the user's own developer instructions and never replaces them.

## Claude

The Claude adapter runs `claude -p --json-schema <schema> --allowedTools Read,Grep,Glob` with the
prompt on stdin. It maps the 3 efforts onto `--effort`.

## Timeouts and failures

Every call has a timeout, set per adapter and overridable per lens. A timed-out or failed call is
retried once on the same adapter. A second failure records the call as failed, and the review result
lists it. A failed call never passes the check run.
