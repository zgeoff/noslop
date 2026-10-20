# Naming, shape and comments

- Trigger: a new exported name, comment density over the target, or an added type claim
- Input: the hunks; the `functions`, `comments` and `typeClaims` slices; the rules file
- Call: C

## Prompt

Find names, shapes, comments and type claims in the change that break a rule in the rules file.

Look for a break of the rules file's rule on:

1. Function names: a verb whose promise in the role table the function breaks, where lint cannot
   check that promise, or a name that does not say what its function does. The role table is the
   table in the rules file that gives the verb for each recurring job and the promise that verb
   makes, such as no I/O.
2. Comments. When the `comments` slice shows the change over the comment-density target, check each
   new block of comments.
3. Type claims. The `typeClaims` slice lists each lint disable comment the change adds for a rule
   that bans type assertions as `cast-disable`, each `any` type it writes as `any-type`, and each
   `JSON.parse` call it adds as `any-value`. An `any` that another call returns counts too.
4. Any other naming or shape rule the rules file states, such as parameter order, options objects,
   or the return type on a miss.

Check each candidate:

1. Quote the rule from the rules file. A candidate with no rule to quote is not a finding.
2. For a function name, quote the one row of the role table whose promise the name breaks.
3. Quote the name or comment in the title.
4. Report each `cast-disable` comment as its own finding, whatever reason it gives, so each new cast
   that keeps a disable comment is seen.
5. For an `any` value, name the typed parameter, return or variable it reaches.

Do not report:

1. A rule the repo's lint config enforces. A disable comment turns its rule off, so a `cast-disable`
   comment is still a finding.
2. Code the change did not add or change, such as a disable comment that was there before it.
3. An `as const` assertion, or a `satisfies` expression: neither one turns a type check off.
4. A choice between two verbs, such as `read` or `load`. A function name finding reports a broken
   promise, never a choice between two verbs.

Severity: P2 for a name that hides behaviour. P2 for an `any` value that reaches a typed place,
under the criterion `wrong-behaviour-edge-path`. P3 for every other finding.
