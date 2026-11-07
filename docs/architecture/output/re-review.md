# Re-review and fix confirmation

A later review of a pull request reads only the files whose patch changed since the last review that
ran the lenses, and it confirms a `fixed` answer only through a fix check. This page covers both,
and the net-change key that scopes the review. [The GitHub App](./github-app.md) covers what a
review posts and the check, and [the fixes-only run](./fixes-only-run.md) covers the run that checks
the `fixed` answers alone, with no review.

## What a re-review reads

A re-review is a later review of a pull request, and it reads only the files whose patch changed
since the last lens review. The summary marker keeps that lens review's
[net-change key](#the-net-change-key) apart from its own key, because a fixes-only run moves its own
key to the head it judged while no lens read the files. The CLI compares the lens review's key with
the key of the pull request at its current head, and the review keeps each file whose patch id
differs or that only one key holds. The diff still runs from the merge base, so the review reads
each kept file's whole patch, and a merge from the base branch adds none of the base branch's own
changes. A rebase or a merge of the base that leaves every patch alone therefore reads no file and
runs no lens call. New findings of a re-review come only from the files it reads.

A re-review reads the whole change when the keys cannot be matched file by file: when the last
review had a failed call, when no lens review completed, or when either key is on a head and the
heads differ. A review of the head that the last review covered reads no file. `--full` reads the
whole change at any head, under [the CLI](./cli.md). The design pass runs only on the first review
of a pull request, under [the design lens](../review/lenses.md#the-design-lens).

A re-review leaves the pull request's description unjudged. Its title and body describe the whole
pull request, while its diff holds only the files whose patch changed, so a file the body names can
look missing from that diff. The prompt of each re-review call therefore asks the lenses to report
no mismatch between the description and the diff, and a full review judges the description. The
[fix call](./fixes-only-run.md) of a `fixed` answer reads the description as it stands, so it can
confirm the fix of a finding about the description.

## Fix confirmation

Only a fix check's verdict confirms a fix. A re-review runs one fix check for each open `fixed`
answer whose finding it no longer reports, and the check judges the finding at the pull request's
head, whatever commit the answer names. The fix check of a model lens's finding is a
[fix call](./fixes-only-run.md), and a finding that a later review posted again under a new title
shares the call of the finding it repeats, under
[a repeated finding](./fixes-only-run.md#a-repeated-finding). The fix check of a static finding is
[its static check](./fixes-only-run.md#static-findings), which runs the static stage again and makes
no model call. A finding that the re-review reports again stays open with no check, because that
report already shows the fix failed. A re-review that only stops reporting a finding therefore
confirms nothing, since its lens may have left the fix out of every call. A bare `fixed`, or a sha
that a rebase or a squash took off the branch, gets a fix check like any other `fixed` answer.

The summary marker keeps each fix a fix check judged fixed, as the finding id and the commit its
answer names. A confirmed fix holds across later reviews, with no new check, until a review reports
the finding again. A later `fixed` answer that names another commit is a new answer, so it waits for
a check of its own. A fix check that judges a finding not fixed, or that fails, leaves the answer
open, and the summary shows the reason. The summary marker keeps each fix that the latest fix check
could not judge, as the finding id, the commit its answer names and the reason, so the check run and
the [findings list](./cli.md#listing-the-findings) give that reason.

A `fixed` reply posted after the last review gets no fix check from the check job that the reply
queues, because that job reads only what GitHub holds. The fix waits for the next run that runs fix
checks: the review of a later push, or a fixes-only run. Until that run, the finding stays open
under [dispositions](./github-app.md#dispositions), so the check passes only on fixes that a fix
check read.

## The net-change key

The summary marker keeps the key of the pull request's net change, the diff from its merge base to
its head, as the review read it. It also keeps the key and the head of the last review that ran the
lenses, and the next review reads only the files whose id moved since that lens review, under
[what a re-review reads](#what-a-re-review-reads). The key holds one patch id per changed file. The
`github` reporter and the CLI each build it the same way, from the patches GitHub lists for the pull
request's files. Each hunk header loses its line numbers, because a change of the base above a hunk
moves them, and keeps the heading of the code the hunk sits in, so 2 like edits in 2 functions get 2
ids. The id hashes the file's status, its earlier path and that patch. A binary or large file, of
which GitHub gives no patch, keys on its blob.

A clean rebase and a merge of the base that touches no line near the pull request's hunks leave
every patch id where it was, so the next review reads no file. A push that changes a file's patch
moves that file's id. GitHub gives no file mode, so a push that changes only the mode of a file the
pull request already changes moves no id, and the next review skips that file. noslop accepts that
gap. Three cases key on the head itself, and that key matches only at that head, so the next review
reads the whole change:

- GitHub lists fewer files than the pull request changes, past its file-list cap.
- The patch ids pass the marker's character budget.
- The pull request's head moved on before the reporter read its files.

When the summary marker holds no key, as a marker that an older release wrote, the next review of
another head reads the whole change and writes the key. A [fixes-only run](./fixes-only-run.md) that
writes its own head writes the key at that head too, and leaves the lens review's key in place, so
the next review's scope stays the same.
