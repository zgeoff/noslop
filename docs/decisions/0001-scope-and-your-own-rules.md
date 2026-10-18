# 0001: Scope and your own rules

- Date: 2026-10-17
- Status: decided
- Updated: 2026-10-18

noslop reviews pull requests that coding agents write, and it runs with little or no config. The
core holds no project names, paths, stack assumptions or taste rules. noslop ships no rule set: each
user brings their own rules in config, and a shared config repo holds the rules that several repos
use.

An organisation can run noslop behind a service of its own. noslop then owns what decides whether a
review is valid. The organisation owns the transport, identity, hosting and policy. The developer
starts the review, and CI only checks its result.

## Why

- Agents follow written rules well, so the review's value is in rules that fit the codebase. Those
  rules belong to the codebase's owner, not to the tool.
- A core with no project in it can be tested on its own and used by anyone.
- A repo with no config still gets a review, so the first run needs no setup.
- Validity stays in noslop, so every organisation's reviews pass the same checks, whatever carries
  them.
- CI checks a result the developer's review produced, so CI holds no model credential and makes no
  model call.

## Alternatives

- **Ship rule packs per stack.** A pack carries one owner's taste to every user, and the core would
  need to know which pack fits which repo.
- **A review tool inside one fleet's ops repo.** It would take that repo's shape and could not
  version on its own.

## Consequences

- Taste rules, stack patterns and risk classes are config, under
  [0010](0010-the-reviewer-config.md).
- A taste lens with no rules file checks only generic concerns.

## Changes

- 2026-10-18: an organisation that runs noslop owns the transport, identity, hosting and policy,
  noslop owns what decides whether a review is valid, the developer starts the review, and CI only
  checks it.
