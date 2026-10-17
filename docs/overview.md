# noslop overview

noslop reviews pull requests that coding agents write. You install it, point it at a repo, and it
reviews each pull request with the model CLI you already use. It runs after lint, puts a static
stage before any model, and only reads: it runs no tests and writes no code. Every finding it posts
needs an answer before the pull request can merge.

A repo works with no config. A `review.json` file adds your own rules, your stack's patterns and
your risk classes, and it can extend a shared config repo.

## How a review runs

1. The static stage parses the changed files once and builds slices: the writes, I/O calls, throws,
   catches, new functions, guards and consumer edges that each lens needs. It reports direct
   findings that need no model.
2. Routing picks the lenses. The correctness lens runs on every code change. Every other lens runs
   only when its trigger matches a slice.
3. A risk score picks the depth: Light, Standard or Deep. The depth sets the model effort and the
   passes a lens runs.
4. noslop groups the fired lenses into calls and sends each call to a model through an adapter. Each
   lens receives only its own slice and hunks.
5. noslop merges the findings, posts each one as an inline comment, and posts a check run. The check
   passes when every finding has a disposition.

## What a finding is

A finding is a defect that the change introduces or exposes, anchored to a line in the diff. A
finding about code outside the diff cites that code at a pinned commit. A finding never rests on a
guess that a change may break something elsewhere.

Each finding carries a lens, a severity from P1 to P3, and a verdict. A CONFIRMED finding was
checked against the code. A PLAUSIBLE finding holds the fact the reviewer could not read.

## The answer to a finding

The author answers each finding in its thread with a typed disposition: `fixed`, `not-a-defect`,
`deferred` or `accepted-risk`. A finding on a line that the pull request added or changed takes
`fixed`, `not-a-defect` or `accepted-risk`, never `deferred`: the pull request fixes the code it
wrote. A re-review covers only the commits since the reviewed head.

## Where your rules live

noslop ships no rule set. You bring 3 things in config:

- A rules file in Markdown, which the taste lenses read and cite by rule name.
- Stack patterns, such as the call names that count as a write in your database layer.
- Risk classes, as path globs, each with the lenses it forces on.

A shared config repo holds the rules that several repos use, and each repo's `review.json` extends
it and overrides it.
