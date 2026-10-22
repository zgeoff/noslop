# The fixes-only run

A fixes-only run lets a fix that lands after the last review round pass the check without a new
review round. It runs whatever the pull request's history holds: a merge of the base, a rebase, a
squash of a lower layer, or no earlier review at all. It runs no lens over the diff, and it raises a
finding only on what a merge commit wrote, under [the resolution check](#the-resolution-check). For
each finding of a model lens whose latest disposition is `fixed`, it makes one small call that
judges the finding at the pull request's head. A sha after `fixed` points the call at
[the fix commit](#the-fix-commit), but no verdict needs one, so a bare `fixed` gets the call too,
and so does a sha that a rebase or a squash took off the branch. A finding of the static stage gets
[its static check](#static-findings) in place of the call.

With no fix commit to read, the fix call reads the finding, its code at the head, the pull request's
net diff from its merge base to the head, and the pull request's title and body as they stand when
the run starts. It answers whether the pull request still holds the defect, with a one-line reason.
A fix such as a new test in another file therefore gets judged on that test. A finding about the
description gets judged on the edited title or body, since an edit to the description changes no
commit.

The run traces the finding's line from the head that posted the finding through the diff to the
head: a hunk above the line moves it. The call then reads the code around the traced line. When the
trace fails, because a later commit rewrote the line, the finding names no line, or the repo holds
no commit of the head that posted it, the call reads the whole file at the head. Code that the diff
deletes counts as moved only when the diff adds code in another file that does what the deleted code
did, even reshaped. When the whole net diff passes the config's file limit, the call reads the diff
of the finding's file alone, so a small file of a large pull request still gets its call. A fix
whose own code or diff passes the file limit gets no call and no verdict, because a cut diff can
hide the fix.

A fix with no verdict, from that file limit or from a failed call, is unjudged. The result lists it
with the reason, and the summary shows it as not judged, never as not fixed. Its answer stays
unconfirmed until a later run judges it.

The summary vouches for the run's head only when a fix call or static check returned a verdict and
an earlier lens review had no failed call. The fix calls read the whole net diff, so such a run
writes the [net-change key](./github-app.md#the-net-change-key) at the head. Any other run, such as
one with no `fixed` answer to judge or one after a lens review whose call failed, keeps the head,
the key and the failed calls of the summary before it. The check then stays on the net change a
review read and passes no commit that no call read. With no summary before it, the run vouches for
the merge base alone. A clean rebase needs no run when the summary marker keys each file, because it
leaves that key where it was.

A `fixed` reply posted after an earlier fixes-only run gets a call too, so the next run, at the same
head or a later one, checks it. A fix the summary already holds as confirmed gets no call. The run's
range starts at the merge base, because each call reads the whole net diff.

The result lists each verdict in its fix checks, so the `github` reporter reads the same verdicts
whether the CLI or `noslop post` sends it. A yes confirms the fix under
[re-review and fix confirmation](./github-app.md#re-review-and-fix-confirmation). A no counts as the
run reporting the finding again, so the check names it as still found, and the summary gives the
reason. The summary marker keeps the findings the run judged fixed with its range, and that range
confirms no other fix, so a fix the run did not ask about stays unconfirmed, a `fixed` reply posted
after the run included. The run keeps the count of reviews. It posts a finding comment only for a
finding of a resolution check.

## The fix commit

A `fixed <sha>` answer whose commit the pull request holds gets a call that reads that commit,
because a fix often lands in a helper or in a file that replaced the finding's file, and neither the
code around the finding nor the diff of the finding's file shows it. Beside the finding, its code at
the head and the description, the call reads these parts, most needed first:

1. The commit's diff of the finding's file, from the commit's first parent.
2. The commit's diff of each other file it touched.
3. Each touched file whole at the head, the finding's file first. The call reads the head, not the
   commit, because a later commit can undo the fix.
4. The pull request's net diff, which shows a later commit that moved the fix.

The call reads every part that fits the config's call limit. When they do not all fit, it leaves out
the net diff first, then the largest whole files, then the largest diffs of other files. A part past
the file limit is left out too, and a binary file has no whole copy. The prompt lists each part it
left out, so the call counts a missing part as unread, never as a missing fix. The diff of the
finding's file is never left out: when it passes the file limit or the call limit, the fix gets no
call and stays unjudged. A file the commit removed has no whole copy, so its diff shows the removal
and the files that replaced it show the fix.

A commit the repo lacks, one the base already holds, and a root commit name no fix commit, so the
call reads the net diff as for a bare `fixed`.

## Static findings

A `fixed` answer to a finding of the [static stage](../review/static-stage.md) gets no model call.
The run runs the static stage again, once, over the whole diff of the pull request from its merge
base to its head, and Assemble applies the finding rules as in a review. The fix fails when that run
reports a finding with the same file and title on the lines that hold the answered finding's line
now, and holds otherwise. The run follows that line from the head that posted the finding through
the diff to the head: a hunk above it moves it, and a hunk that rewrites it hands over the lines it
wrote. The place decides, not the ID, because Assemble numbers 2 findings with one title by their
order, so a fix of the first hands its ID to the second. A finding the run cannot place, such as one
outside the diff, fails while any finding with its file and title remains.

The stage reads the whole diff because its checks read the change as a whole. A test counts as new
only on a line the change adds, so a diff of the fix commit alone sees no new test with no
assertion. A version bump compares a manifest with its side at the base, so a diff of the fix commit
alone sees both sides already bumped. The stage also reads the pull request's title, its body and
its linked issue, so the run reads the linked issue when it judges a static fix.

## After a rebase

A rebase after the last review takes its head off the branch, so the run checks the merges from the
pull request's merge base. Each fix call judges the head and reads the net diff, so a rebase, a
squash of a lower layer, or a merge of the base changes nothing about what the call reads.

## The resolution check

A merge commit among the new commits gets a resolution check in place of a review round. The run
rebuilds the merge with `git merge-tree --write-tree` from its 2 parents. A merge whose tree equals
the rebuilt tree is a clean merge and gets no check. Any other merge holds conflict resolutions or
hand edits, and gets one call over the diff from the rebuilt tree to the merge's tree. That diff
holds only what the merge itself wrote: in a file git could not merge, the deleted lines hold the
conflict markers with each side's lines between them, and the added lines hold the resolution. The
code either side brought in stays out of the call, which reads a worktree of the merge for context.

The call carries the correctness and security lenses. It answers whether the resolution keeps the
change each side made and adds no defect, gives a one-line reason, and reports each defect it finds
as a finding on the resolution's lines. Assemble applies the finding rules to those findings, and a
finding that matches one answered `not-a-defect` drops, as in a review. The reporter posts each
finding at the pull request's head, so the run moves its anchor from the merge's lines to the same
lines at the head. A finding whose lines a later commit rewrote keeps its anchor at the merge and
goes to an issue comment that names the merge and those lines. A resolution with a finding is not
sound, whatever the call answers. A not-sound answer that rests only on findings the author answered
`not-a-defect` holds. A merge of more than 2 parents is not sound with no call, because
`git merge-tree` rebuilds a merge of 2 parents only.

The result lists each verdict in its resolution checks, and the summary shows each one with its
reason. The summary marker keeps each merge whose resolution a run judged sound, with the ones the
summary before it kept, so a reader that counts the commits since the last lens review can count
such a merge as checked. A later verdict on the same merge replaces the earlier one.

A not-sound verdict that raised a finding fails the check through that finding, until the author
answers it. A not-sound verdict with no finding has nothing to answer, so the summary marker keeps
the merge as rejected, and the check fails while the marker holds a rejected merge. A later
fixes-only run keeps the list, and a lens review starts it again. A merge whose call failed, or
whose diff passes the config's call limit, stays unchecked. The run counts it as a failed call, so
the check fails, and the next fixes-only run starts from the head before this run and checks the
merge again. The failed call records the skipped resolution, so the run lists none of its files as
not reviewed, and a small file of a large merge gets no too-large label.
