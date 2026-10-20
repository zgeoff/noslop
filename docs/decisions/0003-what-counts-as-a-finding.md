# 0003: What counts as a finding

- Date: 2026-10-17
- Status: decided
- Updated: 2026-10-20

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
5. **Rules.** A finding that rests on a rule names the rules file that states the rule and quotes
   that file word for word, whatever its criterion. A taste finding always rests on a rule. A
   finding whose quote the file does not hold is dropped. The finding keeps the file and the nearest
   heading above the quote as its rule, and [0010](0010-the-reviewer-config.md) covers how a rules
   file loads. A lens prompt states no rule of its own: it reports a break of a rule only with a
   quote from a rules file.

## Why

- Many defects need context outside the diff: a consumer in another repo, a pinned version, a deploy
  limit. A diff-only reviewer cannot see them.
- A cited location keeps the evidence bar of a diff-only reviewer while widening its reach.
- An anchor in the diff ties every finding to the change, so its author owns it.
- A quote from the rules file makes a taste finding checkable rather than a matter of opinion, and
  code can confirm the quote, so a model cannot invent a rule.
- A rule that lives only in a lens prompt reaches the author's coding agent one finding at a time.
  When the lens and the agent read the same rules file, the agent knows every rule before the first
  review.

## Alternatives

- **Only defects inside the diff.** It misses every defect that needs context outside the diff.
- **Every pre-existing defect the reviewer sees.** It buries the change's own findings under old
  ones the author did not cause.
- **A taste finding names its rule by heading.** It ties the rules file to a heading structure, so a
  renamed heading breaks every citation, and a file written as prose has no rule to name.

## Consequences

- The finding schema holds an anchor, an optional second location, a lens, a severity criterion and
  a verdict.
- The pull request fixes findings on lines it wrote, under [0009](0009-the-merge-loop.md).

## Changes

- 2026-10-18: a taste finding cites its rules file by an exact quote instead of a rule name, and is
  dropped when the file does not hold the quote. Each rules file loads whole.
- 2026-10-20: a finding of any criterion may rest on a rule and quote it, and a lens prompt states
  no rule of its own, so every rule a lens checks comes from a rules file.
