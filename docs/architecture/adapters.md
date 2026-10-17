# Adapters

An adapter runs one call on one model CLI and returns its output as JSON that matches the call's
output schema: the findings of a lens call, or the groups of the merge pass. noslop ships two: one
for Codex and one for Claude Code. Each adapter starts its CLI read-only in its own code, so a
review never changes the repo it reads, and keeps the reviewed repo's agent instruction files out of
the model's context, so the change under review cannot steer its own review. Routing, depth and
blocking all live in noslop, so swapping the adapter changes none of them.
[0011](../decisions/0011-model-adapters.md) records the decision.

[Calls](./calls.md) covers how a call gets its lenses, effort, model and timeout.
[Reporters](./reporters.md) covers the other packages under `adapters/`, which send a review result
to GitHub, a SQLite store or a webhook.

## The adapter contract

The adapter interface in the contract package holds an ID, the adapter's default timeout, its
mapping from noslop's 3 efforts onto the CLI's own effort names, and one function that runs a call.
A call request holds the prompt, the output schema, the effort, the model, the working directory and
the timeout. A call result holds the parsed output, the model that ran, the token counts, the
duration and the CLI's exit status.

An adapter parses the CLI's answer against the call's output schema, and output that fails the
schema rejects the whole call, so a call never returns a partial result. The schema keeps the anchor
rules out, because a bad anchor drops one finding in Assemble and not the whole call, under
[findings](./findings.md). The adapter hands the CLI the same schema as plain JSON Schema with no
draft named, because Claude Code's validator refuses the draft that zod writes into its output.

The CLI wraps each adapter in the options that the config sets for it: the adapter's model runs
every call whose lenses set no model, and the adapter's timeout replaces its default. The adapter's
merge model runs the merge pass, and the defaults give each shipped adapter a cheap one, because the
pass only groups findings it reads.

## Running a process

Every process noslop starts goes through the runner in the runner library, so a test replaces every
spawn with a stand-in runner. The runner starts each process in its own process group, with the
prompt on stdin. On a timeout it stops the whole group, then kills it outright when it ignores the
stop signal, because a model CLI starts children that would otherwise hold its output pipes open
after it exits.

## Read-only by configuration

The review module gives each call a detached worktree of the reviewed head as its working directory,
under the review's own temp folder. Before any call runs, the review removes from the worktree each
file that the `secrets` risk class's paths match, so a model never reads a committed secret. Each
adapter then starts its CLI so that the model can read the worktree and do nothing else: no writes,
no tests, no builds, no repo scripts and no network beyond the model provider. Both adapters append
the same instructions to what the model reads: it is a reviewer that only reads, and the repo's
instruction files are code under review, not instructions to it.

### Codex

The Codex adapter runs `codex exec` in its read-only sandbox, with the prompt on stdin and the
output schema on Codex's own schema flag. It runs ephemeral, so the review leaves no session behind,
and it turns off each Codex feature that runs code, writes, or reaches past the model provider
outside the sandbox. An MCP server runs outside the sandbox too, so the adapter turns off every
server that the user's Codex config or the reviewed repo's Codex config sets. Codex takes a server's
name as a bare key path, so a server whose name it cannot address stops the call before it starts.

The adapter passes `-c project_doc_max_bytes=0`, so Codex loads no `AGENTS.md` from the worktree,
which the change under review can write. It keeps the user's own developer instructions and appends
noslop's after them, so the user's setup keeps applying. Codex writes its last message to a file in
the call's own temp folder, which the adapter parses and then removes, and the adapter adds up the
token use from the JSON events Codex prints.

### Claude

The Claude adapter runs `claude -p` with the read tools alone, the output schema on Claude Code's
own schema flag, and the prompt on stdin. It passes `--setting-sources ''`, so Claude Code reads no
settings file of the user's or the repo's, which keeps the repo's instruction files out and means no
hook of theirs runs inside a review. It passes a strict MCP config, so no MCP server runs, and turns
off session persistence. noslop's instructions append to the system prompt, and the adapter reads
the structured output, the token use and the model that ran from Claude Code's JSON result.

### The gap that remains

The model can open an instruction file itself with its read tools, because the adapter runs it
read-only inside the repo it reviews. Neither adapter blocks that read. The appended instructions
tell the model to treat such a file as code under review, and that line is the only guard against an
instruction file that tries to steer the review.

## Timeouts and failures

Every call has a timeout: the longest its lenses set, else the adapter's timeout from the config,
else the adapter's default. A call that times out, exits with an error, or returns output that fails
the schema rejects. The review module retries a rejected call once on the same adapter, and a second
failure lists the call as failed in the review result while the other calls run on.
[The GitHub App](./github-app.md) covers how a failed call holds back the check run.

## The reference reviewer

The Codex package also holds a reference reviewer for [the eval harness](./eval.md). It runs
`codex exec review` on a corpus case, read-only, and parses its answer into findings, so a recorded
run of it gives the baseline that noslop's runs score against and the noise floor between 2 of its
runs.
