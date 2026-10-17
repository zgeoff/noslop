# Principles

Each principle holds for every review. Each one carries a test that shows whether it holds. The [decision records](decisions/) apply the principles.

| Principle | Statement | Test |
| --- | --- | --- |
| Rules are black and white | Triggers, depth, severity criteria and blocking are rules a machine applies without judgement. A rule accepts some noise to stay consistent. | 2 runs on the same diff mark the same triggers, depth and blocking. |
| Lint runs first | Lint runs in the repo's own checks before noslop. noslop never runs lint and never repeats a rule that lint enforces. | No finding repeats a rule that the repo's lint config enforces. |
| The static stage comes before any model | A fact that code can compute is computed once, in the static stage. A lens judges only what the stage cannot decide. | No lens finding repeats a direct finding of the static stage. |
| The reviewer only reads | A review runs no tests, writes no files in the repo, and reaches no production system. Every adapter is configured read-only. | A review on a read-only mount with no network to production completes. |
| A finding cites what it affects | A finding anchors to a line in the diff. A finding about other code cites it at a pinned commit. | Every finding outside the diff holds a `file:line` at a pinned commit. |
| Every finding gets an answer | The check run fails while any finding, P3 included, has no disposition. | Leave one P3 unanswered: the check fails. |
| The pull request fixes what it wrote | A finding on a line that the pull request added or changed is fixed in that pull request, answered as not a defect, or accepted by the owner. | A `deferred` reply on an added line is refused. |
| It works with no config | Built-in defaults run every generic lens with the shared risk classes. | A review on a repo with no `review.json` completes. |
| The core knows no project | Project names, paths, stack patterns and taste rules live in config. | A search of the core packages for a project name or path finds none. |
| Any model, through an adapter | Each model CLI sits behind an adapter. Routing, depth and blocking live in noslop, outside any adapter. | Swap the adapter: routing, depth and blocking stay the same. |
| Measured per lens | Every finding carries its lens, so yield, noise and recall are measured per lens. | Every stored finding holds a lens id. |
