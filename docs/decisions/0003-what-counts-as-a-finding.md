# 0003: What counts as a finding

- Date: 2026-10-17
- Status: decided

A finding is a discrete, actionable defect that the change introduces or exposes, which the author
would fix if told. It does not rest on an unstated assumption, and it is not an intentional change.
Five rules set its reach and form:

1. **Reach.** A lens may read outside the diff: consumer code, deploy facts and design records. A
   finding about code outside the diff cites that code as `file:line` at a pinned commit. A finding
   never rests on a guess that the change may break something elsewhere.
2. **Pre-existing defects.** A defect that existed before the change is a finding only when the
   change exposes it: the change makes it reachable, or starts to depend on it.
3. **Anchor.** Every finding anchors to a line in the diff. Affected code elsewhere is a second
   location. A missing change, such as a consumer update or a migration, anchors to the changed line
   that needs it.
4. **Verdict.** A finding is CONFIRMED or PLAUSIBLE, under [0004](0004-severity-and-verdicts.md).
5. **Taste.** A taste finding cites its rule by name from the rules file. A taste finding with no
   named rule is dropped.

## Why

- Many defects need context outside the diff: a consumer in another repo, a pinned version, a deploy
  limit. A diff-only reviewer cannot see them.
- A cited location keeps the evidence bar of a diff-only reviewer while widening its reach.
- An anchor in the diff ties every finding to the change, so its author owns it.
- A named rule makes a taste finding checkable rather than a matter of opinion.

## Alternatives

- **Only defects inside the diff.** It misses every defect that needs context outside the diff.
- **Every pre-existing defect the reviewer sees.** It buries the change's own findings under old
  ones the author did not cause.

## Consequences

- The finding schema holds an anchor, an optional second location, a lens, a severity criterion and
  a verdict.
- The pull request fixes findings on lines it wrote, under [0009](0009-the-merge-loop.md).
