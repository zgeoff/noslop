# Architecture and boundaries

- Trigger: a function with cyclomatic complexity of 5 or more that does I/O, or a new interface
- Input: the hunks; the `functions` slice; the rules file
- Call: C

## Prompt

Find structure in the change that will make the next change harder.

Look for:

1. A new interface between processes or packages that is not in the repo's typed contract: a
   hand-matched route, a hand-parsed body, hand-read arguments outside the CLI library.
2. A function that both decides and acts: heavy branching mixed with I/O, where the decision could
   be its own pure step.
3. A layer that adds no behaviour: a wrapper that only forwards its arguments.
4. An option, parameter or extension point that no caller uses.
5. A unit that reaches I/O directly instead of through the dependencies it is given.
6. Structure that a rule in the rules file forbids.

Check each candidate:

1. Report a candidate from items 1 to 5 under the criterion `design-defect`. These hold in every
   repo, with or without a rules file.
2. Report a candidate from item 6 under `taste-rule`, and cite the rule from the rules file by name.
   A `taste-rule` finding with no named rule is dropped.
3. Show the simpler shape in one sentence in `fix`.

Do not report:

1. Code the change did not add or change.

Severity: P2.
