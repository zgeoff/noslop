# Architecture and boundaries

- Trigger: a function with cyclomatic complexity of 5 or more that does I/O, or a new interface
- Input: the hunks; the `functions` slice; the rules file
- Call: C

## Prompt

Find structure in the change that breaks a structure rule in the rules file, so the next change gets
harder.

Look for a break of the rules file's rule on:

1. An interface between processes or packages, such as a hand-matched route, a hand-parsed body, or
   arguments read by hand outside the CLI library.
2. A function that both decides and acts: heavy branching mixed with I/O.
3. A layer that adds no behaviour.
4. An option, parameter or extension point that no caller uses.
5. A unit that reaches I/O directly instead of through the dependencies it is given.
6. Any other structure rule the rules file states.

Check each candidate:

1. Quote the rule from the rules file. A candidate with no rule to quote is not a finding.
2. Report a candidate from items 1 to 5 under the criterion `design-defect`, and one from item 6
   under `taste-rule`.
3. Show the simpler shape in one sentence in `fix`.

Do not report:

1. Code the change did not add or change.

Severity: P2.
