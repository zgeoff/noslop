# Naming, shape and comments

- Trigger: a new exported name, comment density over the target, or an added type claim
- Input: the hunks; the `functions`, `comments` and `typeClaims` slices; the rules file
- Call: C

## Prompt

Find names, shapes and comments in the change that mislead a reader or break a named rule, and the
type claims it adds that no checker confirms.

Look for:

1. A name whose verb hides what the function does: a `format` that also writes, a `find` that cannot
   miss, an `is` that returns a non-boolean.
2. A comment that restates the code instead of giving the reason the obvious alternative is wrong.
3. A new block of comments that pushes the change over the comment-density target.
4. A comment that names project state: a ticket, a date, a person, a session.
5. A shape the rules file names, broken: parameter order, options objects, return types on a miss.
6. A lint disable comment the change adds for a rule that bans type assertions. The `typeClaims`
   slice lists each one as `cast-disable`. Report each comment as its own finding, whatever reason
   it gives, so each new cast that keeps a disable comment is seen.
7. A value typed `any` that the change passes where a typed value is expected: an argument to a
   typed parameter, a typed return, or a typed variable. The `typeClaims` slice lists each `any`
   type the change writes as `any-type`. An `any` that a call returns, such as a parsed JSON value,
   counts too. Lint cannot see this claim, because `any` turns the type check off.

Check each candidate:

1. Cite the rule from the rules file by name. A finding with no named rule is dropped, except for
   rules 1, 2, 6 and 7 above, which hold in every repo.
2. Quote the name or comment in the title.
3. For rule 7, name the typed parameter, return or variable the `any` value reaches.

Do not report:

1. A rule the repo's lint config enforces. A disable comment turns its rule off, so rule 6 still
   holds.
2. Code the change did not add or change, such as a disable comment that was there before it.
3. An `as const` assertion, or a `satisfies` expression: neither one turns a type check off.

Severity: P2 for a name that hides behaviour. P2 for an `any` value that reaches a typed place,
under the criterion `wrong-behaviour-edge-path`. P3 for every other finding.
