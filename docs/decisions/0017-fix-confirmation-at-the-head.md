# 0017: Fix confirmation at the head

- Date: 2026-10-21
- Status: decided
- Evidence at: noslop `122ffe5`

This record sets the rules by which noslop confirms a fix and carries a review onto a new head. Its
aim is one invariant: no rebase, squash, merge from the base, or moved fix needs a special case in
noslop or in the relay, the system that gates merges on noslop's check. Three choices in the current
rules break that invariant, and each new history shape has taken its own patch: a clean rebase, a
late reply after a rebase, a rebase that rewrote a fixed commit, a merge resolution, a lower layer's
squash under a stacked pull request, and a fix in that lower layer. Six decisions follow, each with
its evidence, its options, the history shapes each option removes, the code each deletes, and the
option taken.

## The three causes

A `fixed <sha>` answer ties the fix to one commit. The fix call of a fixes-only run judges that
commit's patch and the diff from it to the head
(`modules/review/src/build-fix-check-prompt.ts:14-19`). A rebase rewrites the commit, a squash
merges it away, and a stacked layer moves it into the base, so each shape needs a way to find the
commit again.

Silence is the evidence of a fix in a normal re-review. A `fixed` answer counts as confirmed when
the re-review read the file and no longer reports the finding
(`adapters/github/src/build-fix-confirmation.ts:41-79`). A review that left the file out, had a
failed call, or ran before the reply says nothing, so the rules track which review read which range
(`adapters/github/src/to-reviewed-ranges.ts`, `adapters/github/src/build-held-fixes.ts`). Two docs
disagree on the late reply: `docs/guides/answer-a-finding.md:80-84` asks for a `--full` review,
while `docs/architecture/output/github-app.md:218-223` counts the kept ranges.

The check passes only on a review of the exact head (`docs/architecture/output/github-app.md:259`,
`adapters/github/src/build-check-outcome.ts:65`). Every carry-over is a special case: a clean
rebase, a merge of the base, a fixes-only run. The relay repeats the same mapping in its own code. A
branch that holds a merge of the base and a rebase refuses `--fixes-only` with
`the merge <sha> takes a full review` (`apps/cli/src/pick-rebased-head.ts:38-42`). Past the relay's
round cap, that leaves the author no path but a new pull request.

## 1. The fix at the head

**Evidence.** The fix call reads the fix commit's patch
(`modules/review/src/build-fix-check-prompt.ts:35-39`). Finding the commit takes the rewrite reader
(`adapters/github/src/make-rewritten-fix-reader.ts`), the base-branch fix test
(`modules/review/src/is-base-branch-fix.ts`), the fix base (`modules/review/src/read-fix-base.ts`)
and the fix floors (`apps/cli/src/read-fix-floors.ts`). The answer parser rejects `fixed` with no
sha (`adapters/github/src/parse-disposition.ts:21`).

| Option                   | What `fixed` means                                                                                                             | Shapes it removes                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| A. The commit (current)  | The named commit fixes the finding, and the fix holds at the head                                                              | None                                                                                                 |
| B. The head, sha a hint  | Judge the finding at the current head. A sha that resolves adds its patch to the call as a hint, and one that fails is ignored | Rebased, squashed or moved fix commit; fix in a lower layer; late reply; fix before the posting head |
| C. The head, sha ignored | As B, with no patch in the call                                                                                                | As B                                                                                                 |

Under B and C, one fix call reads the finding, the anchored code at the head, and the pull request's
diff from its merge base to the head. It returns fixed or not fixed with a one-line reason. The code
at the head is the evidence, so a fix that a lower layer brought in through the base counts, though
the pull request's diff no longer holds it.

**The anchor at the head.** A finding anchors to lines at the head that posted it, and later commits
move those lines. The fix call takes the finding's lines at the head by following each line through
the diff from the posting head to the head, as the static fix check follows it
(`docs/architecture/output/fixes-only-run.md:71-73`). When that trace fails, the call takes the
whole file at the head.

**Deletes under B or C.** The rewrite reader (186 lines, test 397),
`adapters/github/src/read-fix-commits.ts` (186), the base-branch fix test (35, test 113), the fix
base (171), the fix floors (101, test 241), and the rule that a fix commit must come after the
posting head (`docs/architecture/output/github-app.md:201-203`). The fix-call prompt loses its rule
on moved code (`build-fix-check-prompt.ts:19`).

**Decision.** B. A `fixed` answer means the finding no longer holds at the current head. One fix
call judges the finding at the head from the finding, its anchored code and the pull request's diff.
A sha that resolves adds its patch to the call as a hint, and a sha that fails to resolve is
ignored. The parser accepts a bare `fixed`. The sha costs nothing when it resolves and helps the
call find a fix in another file, such as a new test.

## 2. Positive evidence

**Evidence.** A normal re-review makes no fix call. It confirms by silence plus a read of the file
(`adapters/github/src/build-fix-confirmation.ts:41-49`). The GitHub App runs `noslop review` with no
`--fixes-only` (`apps/github-app/src/run-app-job.ts:81-85`), so no fix call ever runs on the App's
path.

| Option                   | What confirms a fix                                                                  | Cost per review                                             |
| ------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| A. Silence (current)     | The re-review read the file and dropped the finding                                  | None                                                        |
| B. The fix check         | A fix call says fixed. A finding the re-review reports again stays open with no call | One call per open `fixed` answer that the re-review dropped |
| C. The fix check, always | As B, and a reported finding gets a call too                                         | One call per open `fixed` answer                            |

Under B and C, a missing finding never confirms a fix. A confirmed fix holds until a later push
changes the finding's file, which brings a new fix call, or a review reports the finding again.

**Shapes removed under B or C.** A review that left the file out, a review with a failed call, a
lens that skipped the file while another lens read it, a rename into a left-out path, and a reply
posted after the review that read its commit. The doc conflict on late replies goes, because a late
reply gets its fix call on the next review or fixes-only run.

**Deletes under B or C.** The fix confirmation (`build-fix-confirmation.ts`, 80, test 188), the fix
lifecycle (`pick-next-fix-state.ts`, 24, test 35), the held fixes (`build-held-fixes.ts` 91 and
`read-held-fixes.ts` 51, tests 310), the kept ranges (`to-reviewed-ranges.ts`, 50), the fix coverage
(`read-fix-coverage.ts`, 83, with `has-skipped-file.ts` and `expand-skipped-paths.ts`),
`read-fix-confirmations.ts` (207), and the summary marker's `earlier` ranges
(`adapters/github/src/summary-marker.ts:12-14`).

**Decision.** B. Only a fix call confirms a fix, and only for a finding the re-review dropped. A
finding the re-review reports again stays open with no call, because the re-report is positive
evidence that the fix failed.

## 3. The net-change key

**Evidence.** The check compares the summary marker's head with the pull request's head
(`build-check-outcome.ts:65`). A delta review starts from the reviewed head only when the branch
still holds it (`apps/cli/src/run-review-command.ts:409-416`). Otherwise a fixes-only run maps the
head by patch id (`apps/cli/src/read-rebased-head.ts`, `apps/cli/src/read-mapped-review.ts`), and a
review drops the base branch's files from a merge
(`docs/architecture/output/github-app.md:183-190`).

The key replaces the head. "Reviewed" means a review read the pull request's net change: the diff
from the merge base of the base and the head to the head.

| Option                   | Key                                                      | Holds across                                                               |
| ------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| A. The head (current)    | The head's sha                                           | Nothing, without a special case                                            |
| B. Per-file patch ids    | Each changed file's patch id, with line numbers left out | Clean rebase, conflict-free merge of the base, lower-layer squash, restack |
| C. The tree of the files | The blobs of the pull request's files at the head        | Clean rebase of a base that touched none of those files                    |

C fails the aim. After a merge of the base that changed a file the pull request also changes, the
file's blob at the head holds the base's change, so the key moves with no change to the pull
request's work. B keys on the diff alone. B moves only when the base changes lines within a hunk's
context lines, and then only that file gets a delta review.

**A push that moves the key.** B keeps a patch id per file, so the files whose patch id changed are
the scope of the delta review. The review reads each such file's net diff at the head. A conflict
resolution or a hand edit in a merge changes the net diff of the files it touches, so the delta
review reads it.

**The resolution check.** A fixes-only run checks each merge's resolution with its own call
(`modules/review/src/run-resolution-checks.ts`, 461 lines, test 1,020). Under B the delta review
reads what a resolution wrote, so the resolution check is deleted. The summary marker loses
`checkedMerges` and `rejectedMerges`, and the relay's parse of the marker goes with them.

**Who computes the key.** `noslop check` reads only GitHub
(`docs/architecture/output/github-app.md:266-269`), while a review has a clone. Git in both would
make the check fetch the repo. Instead, the review and the check both compute the key from the
patches GitHub lists for the pull request's files, with each hunk header's line numbers cut, as the
rewrite reader cuts them (`make-rewritten-fix-reader.ts:136`). Both then hash one input. GitHub
gives no patch of a binary or large file, so that file keys on its blob. A pull request past
GitHub's limit on its file list keys on its head sha, as under A.

**Deletes under B.** The rebased-head mapping (`pick-rebased-head.ts` 74 and `read-rebased-head.ts`
126, tests 491), the mapped review (`read-mapped-review.ts`, 82, test 255), the review base lookup
(`find-review-base.ts` 19 and `read-stored-reviews.ts` 28, tests 106), the merge-of-base gate in a
fixes-only run (`modules/review/src/run-fixes-only-review.ts:214-253`), and the rebase sections of
`docs/architecture/output/fixes-only-run.md`.

**Decision.** B: a patch id per file, computed from GitHub's patches, with the resolution check
deleted.

## 4. The relay, the round cap and the fixes-only run

**Evidence.** The relay caps review rounds and sends `--fixes-only` past its cap, so the fixes-only
run carries most fixes in that setup. The relay repeats noslop's rebase mapping by patch id, its
rewrite of `fixed` shas, its clean-merge test with `git merge-tree`, and a parse of the summary
marker's merge verdicts. It also passes a merge noslop's check refused, when the only problem is
`No noslop review for this commit` and a merge of the base sits on the reviewed head.

Under decisions 1 to 3, the relay reads noslop's check and nothing else. It deletes its own mapping,
its fix rewrite, its merge test, its marker parse, and the pass on a refused check. A round counts
only a review that ran lenses on a moved key. A carry-over moves no key, so it is no round.

| Option                     | Fixes-only run                                                                                                      | Past the cap                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A. Keep it, fix calls only | Runs decision 1's fix call for each open `fixed` answer and writes the key. It refuses only with no answer to judge | The fix calls read the delta                                                         |
| B. Delete it               | None                                                                                                                | A delta review, whose new findings go to issues under [0009](0009-the-merge-loop.md) |

A trusts the fix calls to read every file the key moved on, as the fixes-only run trusts them under
the current rules. B costs a lens review per push past the cap.

**Decision.** A. It keeps the cheap path that the cap relies on and loses every history refusal
(`apps/cli/src/run-review-command.ts:418-450`).

## 5. The migration

The change moves three things, and the decision sets one rule for the state each finds before it.

- **Stored answers.** A `fixed <sha>` reply stays valid, and its sha becomes the hint. An open
  `fixed` answer gets a fix call at the next review or fixes-only run. A fix the summary marker
  holds in `confirmed` stays confirmed until its file changes, with no second judgement.
- **Open pull requests.** A summary marker with no key passes the check only on its exact head, as
  under the current rules. The next review or fixes-only run writes the key. A pull request that a
  merge refusal holds at the cap needs one fixes-only run after the release.
- **The GitHub App.** The App runs the CLI it ships with, so it gains the fix calls with no change
  of its own. It makes one more call per open `fixed` answer that a re-review drops. The relay
  deletes its own mapping only after its repos run the release that writes the key, since an older
  CLI writes none.

## 6. The required check

**Evidence.** [0009](0009-the-merge-loop.md) calls the check required, but no ruleset requires the
`noslop` check, so the relay's gate is the one thing between a pull request and a merge it refuses.
That gate passed a merge of the base on a reviewed head while the check failed, which was right
under the current rules. Under decision 3, the check passes on a carry-over by itself, so the gate
needs no pass of its own.

| Option                    | Who stops a merge         | Owner override                                             |
| ------------------------- | ------------------------- | ---------------------------------------------------------- |
| A. Required in every repo | GitHub, on a failed check | Moves into noslop, as an owner answer at the head, or goes |
| B. The relay's gate, kept | The relay (current)       | Stays in the relay                                         |
| C. Per repo               | Each repo's ruleset       | Differs by repo                                            |

A pull request that merges outside the relay, such as by hand, passes no gate under B. A would make
the check the one rule, with no bypass, but a failure in noslop would then block every merge.

**Decision.** B. The relay's gate stops a merge, with its owner override, and no repo requires the
`noslop` check. A failure in noslop must not block work. The relay deletes its pass on
`No noslop review for this commit` and trusts noslop's check alone. The owner override covers any
refusal.

## Out of scope

Two changes get their own designs: the gate's state moving from GitHub comment markers to the store,
and stored finding IDs in place of the hash of the lens, path, rule and title
(`modules/findings/src/build-finding-id.ts`).

## Delivery issues

Each issue delivers the decisions it names.

- **Judge a fix at the head** (decision 1). Deletes the rewrite reader, `read-fix-commits.ts`, the
  base-branch fix test, the fix base and the fix floors. The parser accepts a bare `fixed`, and the
  fix call takes the finding's lines by a line trace, with the whole file as the fallback.
- **Confirm a fix only through the fix call** (decision 2). Deletes the fix confirmation and its
  lifecycle, the held fixes, the kept ranges, the fix coverage, `read-fix-confirmations.ts`, and the
  summary marker's `earlier` ranges.
- **Key the review on the net change** (decision 3). Deletes the rebased-head mapping, the mapped
  review, the review base lookup and the exact-head rule. The key comes from GitHub's patches, from
  the blob for a binary or large file, and from the head sha past GitHub's limit on the file list.
- **Scope a delta review by changed patch ids** (decision 3). Deletes the merge filter of a
  re-review, the resolution check (`run-resolution-checks.ts`), and the summary marker's
  `checkedMerges` and `rejectedMerges`.
- **Cut the fixes-only run to fix calls** (decision 4). Deletes the fixes-only refusals and the
  merge-of-base gate.
- **Drop the relay's own history rules** (decisions 4, 5 and 6). Deletes the relay's mapping, its
  fix rewrite, its clean-merge test, its marker parse, and its pass on
  `No noslop review for this commit`. The relay keeps its gate and its owner override. This issue
  lands after the relay's repos run the noslop release that writes the key.
- **Rewrite the fix docs** (decisions 1 to 6). Rewrites the rebase sections of the fixes-only doc,
  the late-reply rules in the GitHub App doc and the guide, and the claim in
  [0009](0009-the-merge-loop.md) that the check is required, which becomes the relay's gate stopping
  a merge.
