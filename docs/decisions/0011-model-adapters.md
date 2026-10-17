# 0011: Model adapters

- Date: 2026-10-17
- Status: decided

Each model CLI sits behind an adapter. An adapter takes a prompt and an output schema, runs the CLI, and returns JSON. It maps the 3 depths onto the CLI's own effort names. Every adapter in noslop is configured read-only in its own code: no writes to the repo, no tests, no network to production. The Codex adapter comes first, then a Claude adapter.

noslop itself is a versioned CLI with JSON output, so other tools pin a version and read its results. A review writes only to its own temp folder outside `/tmp`, and deletes that folder whether it passes or fails. When an adapter adds to a CLI's instructions, it appends to the user's own instructions and never replaces them.

## Why

- Routing, depth and blocking live in noslop, so swapping the model changes none of them.
- A second adapter keeps reviews running when one model's service is down.
- A pinned CLI version lets other tools upgrade on their own schedule.

## Alternatives

- **One model CLI, called directly.** An outage of that service stops every review.
- **A runtime check that an adapter is read-only.** The adapters ship inside noslop, so their own configuration is the place to set it.

## Consequences

- An adapter declares its effort mapping and its timeout.
