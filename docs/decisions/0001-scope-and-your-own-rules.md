# 0001: Scope and your own rules

- Date: 2026-10-17
- Status: decided

noslop reviews pull requests that coding agents write, and it runs with little or no config. The core holds no project names, paths, stack assumptions or taste rules. noslop ships no rule set: each user brings their own rules in config, and a shared config repo holds the rules that several repos use.

## Why

- Agents follow written rules well, so the review's value is in rules that fit the codebase. Those rules belong to the codebase's owner, not to the tool.
- A core with no project in it can be tested on its own and used by anyone.
- A repo with no config still gets a review, so the first run needs no setup.

## Alternatives

- **Ship rule packs per stack.** A pack carries one owner's taste to every user, and the core would need to know which pack fits which repo.
- **A review tool inside one fleet's ops repo.** It would take that repo's shape and could not version on its own.

## Consequences

- Taste rules, stack patterns and risk classes are config, under [0010](0010-the-reviewer-config.md).
- A taste lens with no rules file checks only generic concerns.
