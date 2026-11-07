# The fixes-only run

`noslop review --pr <number> --fixes-only` checks each `fixed` answer and runs no review: it runs no
lens and raises no finding. It runs the same whatever the pull request's history holds, such as a
merge of the base, a rebase, or no earlier review. A relay, the service an org runs to decide
merges, can cap the reviews of a pull request and use this run past the cap, as
[enforce a review with a relay](../../guides/enforce-a-review-with-a-relay.md) describes.

For each finding of a model lens whose latest answer is `fixed`, the run makes one small fix call
that judges the finding at the pull request's head. [A repeated finding](#a-repeated-finding) shares
the call of the finding it repeats. A finding of the static stage gets
[its static check](#static-findings) in place of the call.
[Dispositions](./github-app.md#dispositions) lists the answers an author can give.

A sha after `fixed` points the call at [the fix commit](#the-fix-commit). The call never needs a sha
to reach a verdict, so the run makes the call for these answers as well:

- a bare `fixed`;
- a `fixed` whose sha a rebase or a squash took off the branch.

With no fix commit to read, the fix call reads the finding, its code at the head, the pull request's
net diff from its merge base to the head, and the pull request's title and body as they stand when
the run starts. It answers whether the pull request still holds the defect, with a one-line reason.
A fix such as a new test in another file therefore gets judged on that test. A finding about the
description gets judged on the edited title or body, since an edit to the description changes no
commit.

The call judges the defect in the code the finding names. Take a finding that asks a parser to
return `{ kind: 'refused' }` for a bad line in place of a throw. When the parser at the head returns
that value, the call counts the finding fixed, even when the command that calls the parser still
throws on it to turn it into an exit code.

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

The run sets three fields of the summary marker from its own head: the head, the
[net-change key](./github-app.md#the-net-change-key) and the count of failed calls. It sets them
only when both of these hold:

- a fix call or a static check returned a verdict;
- the last lens review had no failed call.

Such a run read the whole net diff at its head, so the key it writes matches what its calls read.
Any other run, such as one with no `fixed` answer to judge, copies the head and the key from the
summary marker before it. As the count of failed calls, that run writes its own failed calls, plus
the earlier count when the earlier marker holds no lens review's head. When no summary marker
exists, the run writes the merge base as the head and its own failed calls as the count.

A `fixed` reply posted after an earlier fixes-only run gets a call too, so the next run, at the same
head or a later one, checks it. A fix the summary already holds as confirmed gets no call. The run's
range starts at the merge base, because each call reads the whole net diff.

The result lists each verdict in its fix checks, so the `github` reporter reads the same verdicts
whether the CLI or `noslop post` sends it. A yes confirms the fix under
[re-review and fix confirmation](./github-app.md#re-review-and-fix-confirmation). A no counts as the
run reporting the finding again, so the check names it as still found, and the summary gives the
reason. The summary marker keeps the findings the run judged fixed with its range, and that range
confirms no other fix, so a fix the run did not ask about stays unconfirmed, a `fixed` reply posted
after the run included.

The run raises no new finding. With the `sqlite` reporter in its report list, the `github` reporter
still posts each earlier finding that the store holds and no finding comment holds, such as one
whose post failed, under [what a review posts](./github-app.md#what-a-review-posts).

## A repeated finding

Assemble builds a finding's ID from a hash of its title, so a later review that words an open
finding's defect another way posts it again under a new ID. The author can then answer `fixed` to
the first finding and to this repeat with the same fix. The run judges a finding and its repeats in
one call, and gives each of them the call's verdict and reason, so the check never confirms one and
keeps another open.

The run takes 2 `fixed` answers as answers to one finding when all of these hold:

- Both findings sit in the same file and come from the same lens.
- 2 different reviews posted the findings, so each review's head is known and the heads differ.
  Assemble already kept apart the findings that one review posted.
- Both findings are file-level, or both lines trace to the same line at the head. A finding whose
  line fails to trace shares no call.
- Both answers name the same fix commit, by a short or a full sha, or neither names one.
- The titles match under the test [Assemble](../review/findings.md#the-rules-assemble-enforces) uses
  to merge 2 findings of one review.

An answer joins a group only when it passes all of these with each answer already in the group,
because 2 answers that each repeat a third can still name 2 defects.

The call reads the code around the first finding's line, and its prompt lists each repeat under the
first finding, with its title and comment. When the call fails, or the fix goes over the file limit,
each finding of the group stays unjudged. Each static finding gets a
[static check](#static-findings) of its own, never a shared call.

## The fix commit

A `fixed <sha>` answer whose commit the pull request holds gets a call that reads that commit,
because a fix often lands in a helper or in a file that replaced the finding's file, and neither the
code around the finding nor the diff of the finding's file shows it. Beside the finding, its code at
the head and the description, the call reads these parts, most needed first:

1. The commit's diff of the finding's file, from the commit's first parent.
2. The commit's diff of each other file it touched.
3. Each touched file whole at the head, the finding's file first. The call reads the head, not the
   commit, because a later commit can undo the fix. A touched file the head lacks appears as absent,
   so the call sees a test that a later commit deleted.
4. The pull request's net diff, which shows a later commit that moved the fix.

The call reads every part that fits the config's call limit. When they do not all fit, it leaves out
the net diff first, then the largest whole files, then the largest diffs of other files. A part past
the file limit is left out too, and a binary file has no whole copy. The prompt lists each part it
left out, so the call counts a missing part as unread, never as a missing fix. The diff of the
finding's file is never left out: when it passes the file limit or the call limit, the fix gets no
call and stays unjudged. A fix whose prompt passes the call limit before it holds any part gets no
call either. When the commit removed the finding's file, the files that replaced it show the fix.

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

## Merge commits

The run never reads a merge commit as a separate input. A conflict resolution or a hand edit in a
merge changes the patch of each file it touches, so the next review reads that file under the
[net-change key](./github-app.md#the-net-change-key), as it reads any other changed file.
