# 0012: The findings store

- Date: 2026-10-17
- Status: decided

noslop owns one store of every finding and its disposition. Other tools read it, and keep no copy of their own.

The store gives 4 measures per lens:

- **Yield:** the share of its findings that end `fixed`.
- **Noise:** the share that end `not-a-defect`. Authors write these labels, so a small sample of them gets an independent check.
- **Recall:** found through escapes. A bug issue links the change that caused it, and the store shows which lenses fired on that change and what they reported.
- **Cost and latency,** per call and per depth.

An eval harness replays a labelled corpus of past changes at their reviewed heads, and a prompt or grouping change runs on it before it ships.

## Why

- One owner keeps every reader on the same data.
- Per-lens measures show which lens earns its cost.
- A replay on known cases tests a change before it reaches a real pull request.

## Alternatives

- **Each consumer keeps its own copy.** The copies drift apart.
- **Measure only live reviews.** A prompt change is tested only after it ships.

## Consequences

- Every stored finding holds its lens id, depth, call, model and effort.
