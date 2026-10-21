# Answer a finding

Every finding noslop posts on a pull request needs an answer before the `noslop` check passes. You
answer a finding with a reply whose first line is a disposition: a kind, a space, and a value.
noslop judges each disposition against its rule, and the check passes once every finding holds a
valid one. [The GitHub App](../architecture/output/github-app.md) owns those rules and the check,
and [0009](../decisions/0009-the-merge-loop.md) records why the merge works this way.

## Write the reply

1. Find the finding's comment. Most findings sit inline on the diff, at the lines they are about. A
   finding on a line outside the diff sits in an issue comment on the pull request, with its file
   and lines.
2. Expand the comment's collapsed block to see the accepted forms and the finding's id, a
   16-character hex string.
3. Reply with the disposition on the first line. You can explain more on the lines below it:

   ```text
   not-a-defect the caller already holds the lock

   Both callers take the lock in withStock before they reach this line.
   ```

   For a finding in an issue comment, write a new issue comment on the pull request that starts with
   the finding's id, then the disposition:

   ```text
   4f0c2a9e1b7d3c58 not-a-defect the caller already holds the lock
   ```

4. Wait for the check to update. Each reply, edit or deletion sets the check again, with no new
   review.

The finding's latest disposition counts, so to change your answer, reply again. A reply in any other
form is no disposition. noslop answers it once with the accepted forms, and the finding stays open.

## The four kinds

| Kind            | Value          | Means                                  | Valid when                                              |
| --------------- | -------------- | -------------------------------------- | ------------------------------------------------------- |
| `fixed`         | a sha, or none | the head no longer holds the defect    | a fix check confirms it                                 |
| `not-a-defect`  | a reason       | the finding is wrong                   | always                                                  |
| `deferred`      | an issue       | real, but it waits for a tracked issue | the change did not write the code, and the issue exists |
| `accepted-risk` | a reason       | real, and you accept it                | the author has admin permission on the repo             |

A `fixed` reply may end at the word, or name a sha of 7 to 40 hex characters as a hint. A fix check
judges the finding at the head whatever the sha names, so after a rebase or a squash you need not
reply again. The issue of a `deferred` reply is `#<number>` in the same repo,
`<owner>/<repo>#<number>`, or an issue URL.

## Which kinds a finding can take

A finding on a line the pull request wrote takes `fixed`, `not-a-defect` or `accepted-risk`. It
never takes `deferred`, because a pull request does not defer its own defect to later work. A
`deferred` reply on it leaves the finding open, and the check run gives the reason
`the change wrote this code, so it takes fixed, not-a-defect or accepted-risk`.

A finding on code the pull request did not write can take `deferred` too, unless it is a P1, a
security finding or a risk-class finding. Those block the merge whatever code they sit in, and the
check run gives that as the reason.

`accepted-risk` from someone without admin permission on the repo leaves the finding open, with the
reason `only a repo owner gives accepted-risk`.

## Answer with a fix

A `fixed` reply counts once a fix check judges the finding fixed at the pull request's head. For a
finding of a model lens, the fix check is a fix call: one small model call on the finding. For a
finding of the static stage, the fix check runs the static stage again over the whole pull request,
with no model call. A review runs a fix check for each `fixed` reply present when it runs, so post
the reply before the push that carries the fix:

1. Commit the fix on the branch.
2. Reply `fixed`, or `fixed <sha>` with that commit's sha as a hint.
3. Push the branch. The App reviews the new commits and runs the fix check.
4. Expect the finding's comment to show its heading struck through, and the check to stop listing
   the finding.

The fix may sit in any file of the pull request, such as a test beside the finding's file, so you
never need to touch the finding's file only to name it. The fix check reads the pull request's title
and body as they stand, so for a finding about the description, edit the description and reply
`fixed`.

When the check run gives the reason `no re-review has read the fix yet`, or names your commit, no
fix check has judged your reply, because the last review ran before it. Ask whoever runs the App to
run the fix checks with the App's credentials in the environment:
`noslop review --pr <number> --fixes-only --report github`. When the reason is
`the re-review still finds it`, the review reported the finding again or the fix check judged it not
fixed: fix it again, or answer with another kind.

## Read the check

The check's title states the first problem, and its text lists each open finding with its id, its
title and the reason. The check also fails while no review has finished on the current head, or when
a review had a failed call, so a push leaves it failing until the re-review ends.
[The check run](../architecture/output/github-app.md#the-check-run) lists every condition.
