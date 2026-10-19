# The fixes-only run

A fixes-only run lets a fix that lands after the last review round pass the check without a new
review round. It starts from the head of the newest run with no failed call that the summary marker
keeps, and the branch must still hold that head. It runs no lens over the diff and raises no
finding. For each finding whose latest disposition is `fixed` with a commit among the new commits,
it makes one small call. That call reads the finding, the code around the line it anchored to at
that head, and the diff of the finding's file since that head, and answers whether the diff fixes
the finding, with a one-line reason. A fix whose code or diff passes the config's file limit gets no
call.

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
The run writes the summary at the new head, keeps the count of reviews, and posts no finding
comment, so the check reads the current head.
