# The fixes-only run

A fixes-only run lets a fix that lands after the last review round pass the check without a new
review round. It starts from the head of the newest run with no failed call that the summary marker
keeps, and the branch must hold that head or a commit that a rebase made of it. It runs no lens over
the diff, and it raises a finding only on what a merge commit wrote, under
[the resolution check](#the-resolution-check). For each finding whose latest disposition is `fixed`
with a commit among the new commits, it makes one small call. That call reads the finding, the code
around the line it anchored to at that head, and the diff since that head of the finding's file and
of each file the fix commit changes, and answers whether the diff fixes the finding, with a one-line
reason. A fix such as a new test in another file therefore gets judged on that test. A fix whose
code or diff passes the config's file limit gets no call. A fix commit that changes no file of the
pull request's diff gets no call either, and the run judges it not fixed, by the same rule the
[check](./github-app.md#re-review-and-fix-confirmation) applies.

A `fixed` reply posted after an earlier fixes-only run passed its commit gets a call too, so the
next run, at the same head or a later one, checks it. Its diff starts from the newer of the head
that posted the finding and the head of the newest review that ran its lenses, because that review
judged every fix before it. A fix the summary already holds as confirmed gets no call.

The result lists each verdict in its fix checks, so the `github` reporter reads the same verdicts
whether the CLI or `noslop post` sends it. A yes confirms the fix under
[re-review and fix confirmation](./github-app.md#re-review-and-fix-confirmation). A no counts as the
run reporting the finding again, so the check names it as still found, and the summary gives the
reason. The summary marker keeps the findings the run judged fixed with its range, and that range
confirms no other fix, so a fix the run did not ask about stays unconfirmed, a `fixed` reply posted
after the run included. A static finding takes a full review, so the run judges its fix not fixed.
The run writes the summary at the new head and keeps the count of reviews, so the check reads the
current head. It posts a finding comment only for a finding of a resolution check.

## After a rebase

A rebase after the last review takes its head off the branch, so the run maps that head onto the
branch before it starts. The reviewed commits past the pull request's base must open the branch in
the same order, each with the same patch by git's patch id, which ignores whitespace and file order,
and the run starts from the branch commit that matches the reviewed head. Each fix diff therefore
still covers only the commits after the review. A reviewed commit whose patch the base already holds
belongs to the base, as in a stack whose base branch rebased too, so the mapping leaves it out.

The run refuses, and gives the reason, in five cases:

- The rebase changed a reviewed commit's patch, such as by a conflict resolution.
- The reviewed range, or the branch commits it maps onto, holds a merge, which has no patch id.
- A reviewed commit is empty, so it has no patch to match.
- The branch holds fewer commits past the base than the reviewed range.
- The repo holds no commit of the reviewed head.

A `fixed` answer that names a fix commit the rebase rewrote counts the branch commit with the same
change, as the check counts it, and the run judges that commit. A `fixed` reply posted after an
earlier fixes-only run gets no call when the head its diff would start from is off the branch, since
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
whose diff passes the config's call limit, stays unchecked, and the run lists its files as not
reviewed.
