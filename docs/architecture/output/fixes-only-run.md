# The fixes-only run

A fixes-only run lets a fix that lands after the last review round pass the check without a new
review round. It starts from the head of the newest run with no failed call that the summary marker
keeps, and the branch must hold that head or a commit that a rebase made of it. It runs no lens over
the diff, and it raises a finding only on what a merge commit wrote, under
[the resolution check](#the-resolution-check). For each finding of a model lens whose latest
disposition is `fixed` with a commit among the new commits, it makes one small call. A finding of
the static stage gets [its static check](#static-findings) in place of the call.

The fix call reads the finding, the code around the line it anchored to at that head, the whole
patch of the fix commit, and the diff of every file from the fix commit to the head. It answers
whether the fix commit fixes the finding and the fix holds at the head, with a one-line reason. A
fix such as a new test in another file therefore gets judged on that test. The later diff covers
every file because a later commit can move the fix's code or its test to a file the fix commit never
changed. A line of the fix that the later diff deletes counts as moved only when that diff adds it
in another file, so a deleted test leaves the fix not fixed. A fix whose code, patch or diff passes
the config's file limit gets no call and no verdict, because a cut diff can hide the fix, and the
summary says why the fix stays unconfirmed. A fix commit that changes no file of the pull request's
diff gets no call either, and the run judges it not fixed, by the same rule the
[check](./github-app.md#re-review-and-fix-confirmation) applies.

A run with no `fixed` answer to judge refuses and gives the reason. It writes no summary, so the
check stays on the head it was on and passes no commit that no lens read. The run goes ahead in two
cases:

- Each of the branch's own new commits is a merge whose other parents the pull request's base holds.
  Such a merge brings in only code the base holds, and the [resolution check](#the-resolution-check)
  judges each one that is not clean.
- A clean rebase made the head of the reviewed head, and no commit follows it. The
  [mapping after a rebase](#after-a-rebase) matched each reviewed commit by its patch, so the review
  still holds for the head, and the run carries it onto the head with the count of reviews kept.

A `fixed` reply posted after an earlier fixes-only run passed its commit gets a call too, so the
next run, at the same head or a later one, checks it. Its diff starts from the newer of the head
that posted the finding and the head of the newest review that ran its lenses, because that review
judged every fix before it. A rebase that took either head off the branch changes where the diff
starts, as the mapping after a rebase describes. A fix the summary already holds as confirmed gets
no call.

The result lists each verdict in its fix checks, so the `github` reporter reads the same verdicts
whether the CLI or `noslop post` sends it. A yes confirms the fix under
[re-review and fix confirmation](./github-app.md#re-review-and-fix-confirmation). A no counts as the
run reporting the finding again, so the check names it as still found, and the summary gives the
reason. The summary marker keeps the findings the run judged fixed with its range, and that range
confirms no other fix, so a fix the run did not ask about stays unconfirmed, a `fixed` reply posted
after the run included. A run that goes ahead writes the summary at the new head and keeps the count
of reviews, so the check reads the current head. It posts a finding comment only for a finding of a
resolution check.

## Static findings

A `fixed` answer to a finding of the [static stage](../review/static-stage.md) gets no model call.
The run runs the static stage again, once, over the whole diff of the pull request from its merge
base to its head, and Assemble applies the finding rules as in a review. The fix fails when that run
reports a finding with the same file and title on the lines that hold the answered finding's line
now, and holds otherwise. The run follows that line from the head that posted the finding through
the diff to the head: a hunk above it moves it, and a hunk that rewrites it hands over the lines it
wrote. The place decides, not the ID, because Assemble numbers 2 findings with one title by their
order, so a fix of the first hands its ID to the second. A finding the run cannot place, such as one
outside the diff, fails while any finding with its file and title remains. A fix commit that changes
no file of the pull request fails first, by the rule every fix follows.

The stage reads the whole diff because its checks read the change as a whole. A test counts as new
only on a line the change adds, so a diff of the fix commit alone sees no new test with no
assertion. A version bump compares a manifest with its side at the base, so a diff of the fix commit
alone sees both sides already bumped. The stage also reads the pull request's title, its body and
its linked issue, so the run reads the linked issue when it judges a static fix.

## After a rebase

A rebase after the last review takes its head off the branch, so the run maps that head onto the
branch before it starts. The reviewed commits past the pull request's base must open the branch in
the same order, each with the same patch by git's patch id, which ignores whitespace and file order,
and the run starts from the branch commit that matches the reviewed head. Each fix diff therefore
still covers only the commits after the review. A reviewed commit whose patch the base already holds
belongs to the base, as in a stack whose base branch rebased too, so the mapping leaves it out.

A squash merge of a lower stack layer holds no single commit's patch, so the base matches none of
that layer's commits by patch. The mapping leaves out every reviewed commit below the base that the
last lens review read, as the store records it, because the lower layer's own review read those
commits. A delta review's stored base is the head of the review before it, so the run follows each
such head back to the base of the review that read it. With no lens review of that head in the
store, the mapping counts every reviewed commit past the pull request's base. A branch that carries
a lower layer's commit as its own fails the match, since the reviewed commits do not open the
branch.

A fixes-only run stores its own head as its base. When a lower layer rebased under such a run, the
commits below the run's head match neither the base nor the lens review's base. When the reviewed
head maps to no branch commit, the run maps the last lens review's head instead, and each fix commit
after it takes the fix path.

The run refuses, and gives the reason, in five cases:

- The rebase changed a reviewed commit's patch, such as by a conflict resolution.
- The reviewed range, or the branch commits it maps onto, holds a merge, which has no patch id.
- A reviewed commit is empty, so it has no patch to match.
- The branch holds fewer commits past the base than the reviewed range.
- The repo holds no commit of the reviewed head.

A `fixed` answer that names a fix commit the rebase rewrote counts the branch commit with the same
change, as the check counts it, and the run judges that commit.

A `fixed` reply posted after an earlier fixes-only run needs a head its diff can start from. The run
maps the head that posted the finding onto the branch, by the same patch match. A lens review whose
head a rebase took off the branch judged each fix before it by the sha that fix had then, and the
check counts no rewritten sha as judged, so that lens head bounds no diff and the run judges the fix
again. A fix gets no call when the head that posted its finding has no match on the branch, since
the run cannot tell whether the fix came after that head.

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
merge again. The run lists the files of a resolution past the call limit as not reviewed.
