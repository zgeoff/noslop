# noslop

noslop reviews pull requests that coding agents write. It runs after lint, puts a static stage before any model, and only reads. Every finding it posts needs an answer before the pull request merges.

A repo needs no config to start. A `review.json` adds your own rules, your stack's patterns and your risk classes, and can extend a shared config repo.

## Docs

- [Overview](docs/overview.md)
- [Principles](docs/principles.md)
- [Scope](docs/scope.md)
- [Decisions](docs/README.md#decisions)
