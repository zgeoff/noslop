# 0017: Fix confirmation at the head

- Date: 2026-10-21
- Status: decided
- Updated: 2026-11-07

This record sets how noslop confirms a fix, what a later review reads, and what noslop's `noslop`
check run means. Its aim is one invariant: a rebase, a squash, a merge of the base or a moved fix
never needs a special case in noslop or in the relay. The relay is the system that each org runs
beside noslop to decide merges, as
[enforce a review with a relay](../guides/enforce-a-review-with-a-relay.md) describes. noslop
reviews and reports the state of each finding, and the relay decides the merge.
[The GitHub App](../architecture/output/github-app.md) defines an answer, the summary marker, the
net-change key and the fix check. [Findings](../architecture/review/findings.md) defines a lens, the
static stage, the risk class and the severities, from P1, the highest, to P3.

## 1. The fix at the head

An author answers a finding `fixed` when the finding no longer holds at the pull request's current
head. A fix call, one model call per answer, judges the finding at the head from the finding, its
code at the head and the pull request's net diff from its merge base. The author may add a commit
sha, as in `fixed 1a2b3c4`, as a hint. When the sha resolves, the call also reads that commit. When
the sha fails to resolve, noslop ignores it. A bare `fixed` is valid.

The finding's comment records the head commit of the review that posted the finding. noslop follows
each of the finding's lines from that commit to the current head, and gives the call the whole file
at the head when a line cannot be followed.

**Why.** A sha ties the fix to one commit. A rebase rewrites that commit, a squash merges it away,
and a stacked pull request can move it into the base, so each of those needs its own code to find
the commit again. The code at the head shows the fix whatever the history did.

**Alternatives.** Judge the named commit: noslop needs code for each history shape to find the
commit. Ignore the sha: when the net diff exceeds the file limit, the call reads only the diff of
the finding's file, so without the commit it can miss a fix in another file, such as a new test.

## 2. Only a fix check confirms a fix

A fix check confirms a fix. For a finding of a model lens, the fix check is a fix call. For a
finding of the static stage, noslop runs the static stage again, with no model call. A review runs a
fix check for each `fixed` answer that is not yet confirmed and whose finding the review no longer
reports. When a later review reports the finding again, noslop runs no fix check and leaves the
finding open, because that report shows the fix failed. A review that stops reporting a finding
never confirms its fix by that alone, since the review's lens calls may have left the fix out. A
confirmed fix holds until a review reports the finding again.

**Alternatives.** Confirm by silence: a review that left the file out, had a failed call, or ran
before the answer would confirm a fix it never read. Run a fix call on a reported finding too: one
more call per answer, against a report that already shows the fix failed.

## 3. The net-change key scopes the next review

A later review reads only the files whose patch changed since the last review that ran the lenses.
The summary marker keeps the net-change key: one patch id per file the pull request changes, taken
from its diff from the merge base. noslop computes each id from the patch GitHub lists for the file,
with the line numbers of each hunk header left out, so a change of the base above a hunk keeps the
id. GitHub gives no patch for a binary or large file, so that file keys on its blob.

A clean rebase, a merge of the base that touches no line near the pull request's hunks, and a squash
or restack of the pull requests below it in a stack keep every id, so the next review reads no file.
A conflict resolution or a hand edit in a merge changes the diff of the files it touches, so the
next review reads what the merge wrote.

Two cases are accepted gaps:

- GitHub's patches carry no file mode, so a push that changes only the mode of a file the pull
  request already changes moves no id, and the next review skips that file.
- When GitHub lists fewer files than the pull request changes, the key holds the head's sha, so each
  later review of a new head reads the whole change.

**Alternatives.** Key on the head's sha: every push, rebase or merge of the base makes the next
review read the whole change. Key on the files' blobs at the head: a merge of the base that touches
a file the pull request changes moves the key with no change to the pull request's own work.

## 4. The check means no open finding

noslop's check fails while any finding is open, and passes otherwise. The check reads only the
findings and their answers. These events leave the outcome as it was:

- a push that no review has read yet, such as a late commit or a rebase;
- a failed lens call;
- a failed reporter, such as a store write that failed after the review.

A finding is open until its latest answer is valid. noslop judges each answer by these rules, which
the check and `noslop findings --json` share, because they hold in any repo:

- A `fixed` answer is valid once a fix check confirms the fix, and stays valid until a later review
  reports the finding again. When the answer names a commit, the reason for an open finding names
  that commit.
- A `not-a-defect` answer is always valid.
- A `deferred` answer is valid when the issue it names exists. It is never valid for code the pull
  request wrote, or for a P1, security or risk-class finding.
- An `accepted-risk` answer is valid only from a repo admin.

The relay decides the merge from the open findings and its own rules, such as green CI, a review of
the current head, an owner override, or a cap on the reviews of one pull request. A repo with no
relay can require the check in its branch rules.

**Why.** A check that also judged which reviews ran needed a special case for each git history, such
as a rebase or a squash, once in noslop and again in the relay. The relay knows the repo's merge
policy, and noslop does not.

**Alternatives.** Drop noslop's check, so noslop only comments: a repo with no relay then has no
gate at all. Fail the check only on P1 and P2 findings: the merge can then happen before any person
reads the P3 findings.

## 5. `--fixes-only` runs the fix checks alone

`noslop review --pr <number> --fixes-only` runs the fix checks and nothing else. The run uses no
lens, raises no finding, and works the same whatever the pull request's history holds. A relay that
caps the reviews of a pull request can have developers use this run past the cap, so fixes still get
confirmed and no new finding appears.

**Alternatives.** Drop the flag: past the cap, a relay could confirm a fix only through a review
that can raise new findings.

## 6. Cut input is never judged

noslop makes no fix call when the code or the diff that the call needs exceeds the file limit,
`thresholds.maxFileChars` in the config on the base branch. The fix stays unjudged and its finding
stays open. `noslop findings --json` marks the finding unjudged with that reason, so the relay can
ask the owner for an override and say why.

**Why.** A call that reads a cut file can confirm a fix it never saw.

## 7. Migration

- **Stored answers.** A `fixed <sha>` reply stays valid, and its sha becomes the hint. A fix the
  summary marker holds as confirmed stays confirmed.
- **Summary markers.** noslop reads a marker that an older release wrote and ignores the fields it
  no longer uses, such as a review count and lists of merges. It keeps the list of findings that an
  older release filed to an issue, and posts none of them on the pull request. When a marker holds
  no key, the next review of another head reads the whole change and writes the key.
- **The GitHub App.** The App server runs the CLI release it ships with, so the App gets each rule
  in this record with no code of its own.

## Changes

- 2026-11-07: rewritten to the final design. noslop reviews and the relay gates; the check means
  only that no finding is open; `--fixes-only` runs the fix checks alone; the answer rules stay in
  noslop; cut input is never judged. Dropped the cap on reviews, the check's pass on an unchanged
  key, and the migration rule for open pull requests. Recorded the file-mode gap of the key.
