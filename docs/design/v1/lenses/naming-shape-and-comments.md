# Naming, shape and comments

- Trigger: a new exported name, or comment density over the target
- Input: the hunks; the `functions` and `comments` slices; the rules file
- Call: C

## Prompt

Find names, shapes and comments in the change that mislead a reader or break a named rule.

Look for:

1. A name whose verb hides what the function does: a `format` that also writes, a `find` that cannot
   miss, an `is` that returns a non-boolean.
2. A comment that restates the code instead of giving the reason the obvious alternative is wrong.
3. A new block of comments that pushes the change over the comment-density target.
4. A comment that names project state: a ticket, a date, a person, a session.
5. A shape the rules file names, broken: parameter order, options objects, return types on a miss.

Check each candidate:

1. Cite the rule from the rules file by name. A finding with no named rule is dropped, except for
   rule 1 and rule 2 above, which hold in every repo.
2. Quote the name or comment in the title.

Do not report:

1. A rule the repo's lint config enforces.
2. Code the change did not add or change.

Severity: P2 for a name that hides behaviour. P3 for every other finding.
