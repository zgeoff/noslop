# 0005: The lens set

- Date: 2026-10-17
- Updated: 2026-10-19
- Status: decided

noslop has 13 lenses that routing picks, and the design lens, which it never picks. Each one is a
single review concern:

| Lens                               | Concern                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Correctness                        | General defects: every outcome traced, the new path against the one it replaces, each changed value to its consumers |
| Security and input trust           | Gate logic, untrusted values that reach a sink, widened permissions                                                  |
| Concurrency and data integrity     | Races, retries after partial failure, transactions, idempotency, schema and migrations                               |
| Failure handling and observability | Expected outcomes thrown, guards and invariants, swallowed errors, failures no operator sees                         |
| Architecture and boundaries        | Interfaces outside a typed contract, decisions mixed with effects                                                    |
| Cross-repo and platform limits     | Consumers of a changed export, pins, versions, published limits                                                      |
| Deploy and config                  | Infra, workflows, config reads, deploy facts                                                                         |
| Reuse                              | A new function that does the job of an existing one                                                                  |
| Naming, shape and comments         | Names that hide behaviour, comment density and content                                                               |
| Tests                              | Tests that cannot fail, changed behaviour with no test                                                               |
| Intent                             | The issue's acceptance criteria, work it did not ask for, claims in the pull request body                            |
| Instructions                       | Agent instruction files, read with every file that loads beside them                                                 |
| Documentation                      | Prose files, on a large docs change                                                                                  |
| Design                             | Whether a better approach meets the task that the pull request states, on every review after its first               |

Code comments belong to naming, shape and comments, which reads the code beside them.

The design lens runs after the other lenses and the merge pass, over the findings of every review so
far, the whole diff and the pull request body. Its task is what the body states, and it reads no
linked issue.

## Why

- Each lens has its own trigger and slice, so a lens fires only when the change holds its concern.
- Correctness catches the general defects that no narrow lens owns.
- Agent-written code drifts most on taste, intent and tests, so those concerns get their own lenses.
- An agent that answers each finding with a patch can patch the same logic review after review, or
  grow a redesign toward an outside spec, and no lens that judges one line asks whether the approach
  is wrong. The findings of 2 or more reviews show that pattern, so the design lens starts at the
  second review.
- A pull request body that promises more than its task needs is its own defect, so the design lens
  judges the approach against the body, and its call holds no linked issue. The other lenses still
  read the issue that the body closes.

## Alternatives

- **One whole-diff review.** Every call pays for the whole diff, and no concern gets a focused read.
- **A performance lens.** No measured need yet. Correctness reports what it sees, and input bounds
  belong to the static stage.

## Consequences

- Each lens is a separate unit with its own id, trigger, slice, prompt section and output schema,
  under [0008](0008-stacking-lenses-into-calls.md).
- The design lens costs one more call on each review after the first, and a review of a local
  change, which has no earlier review, never runs it.
- A design call that fails is a failed call of the review, as a lens call is, so that review
  confirms no fix.

## Changes

- 2026-10-19: add the design lens, which asks from the second review of a pull request on whether a
  better approach meets the task that the pull request body states.
