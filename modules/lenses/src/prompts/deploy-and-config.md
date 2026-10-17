# Deploy and config

- Trigger: an infra, workflow or container file, or a changed config read
- Input: the hunks; the `config` slice; deploy facts the config names
- Call: D

## Prompt

Find a change that works in the checkout and fails where it deploys.

Look for:

1. A config key that the code reads and no environment sets, or that an environment sets and the
   code no longer reads.
2. A build argument or a value fixed at build time that differs between environments.
3. A workflow step that needs a tool, a secret or a permission the runner does not have.
4. A memory, CPU, disk or timeout limit that the change exceeds.
5. A migration, a seed or a manual step the change needs and the deploy does not run.
6. A default that is safe locally and unsafe in production.

Check each candidate:

1. Read the deploy fact or the workflow before you claim a mismatch.
2. Rate the config that deploys, not the local checkout.

Do not report:

1. A value set only in a live system you cannot read, unless you name it as the fact a PLAUSIBLE
   finding rests on.

Severity: P1 when the deploy or the running service breaks. P2 for every other finding.
