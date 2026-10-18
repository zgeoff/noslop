# Findings

A finding is one defect at one place in the reviewed head, and it is the unit every part of noslop
passes on: the lenses report findings, Assemble checks and merges them, and every reporter writes
them out. [0003](../decisions/0003-what-counts-as-a-finding.md) sets what counts as a finding, and
[0004](../decisions/0004-severity-and-verdicts.md) sets severity and verdicts. A finding's severity
follows from the criterion it names, never from the model's own choice, and its ID survives a
re-review that finds the same defect at a moved line. The contract package (`@noslop/contract`)
holds the finding schema, and the findings module holds Assemble.

## Model output and the finding

A lens reports a model finding, and Assemble turns it into a finding. The two shapes differ on
purpose. A model CLI's structured output needs every key present, so the model finding holds null
for an absent value. Its schema leaves the anchor rules out, so a bad anchor drops one finding in
Assemble instead of failing the whole call. The finding drops the nulls and adds what only noslop
knows: the ID, the lens, the call that reported it, whether the change wrote the anchored line, and
the marked risk class whose paths hold the anchor.

The criterion is one row of the severity table in 0004, and the contract package maps each criterion
to its severity. Assemble sets the severity from that map, and the finding schema refuses any other
severity, so a model that names a criterion with a different severity gets the criterion's. The
shared prompt header renders the same map for the model, as [the lenses](./lenses.md) describes, so
the table the model reads and the check Assemble runs come from one source.

A direct finding of [the static stage](./static-stage.md) takes the model finding's shape, with the
lens `static` and no call. It is always CONFIRMED, because the stage read its fact from the code.

## The rules Assemble enforces

Assemble reads the raw findings of every call and the static stage's direct findings together, and
drops each one that breaks a finding rule. The CLI logs every dropped finding with its reason.

1. A finding whose anchor overlaps no hunk of the diff is dropped. The head lines of each hunk, its
   context lines included, are the diff a finding may anchor to.
2. A finding whose anchor holds no line the change touched is dropped, unless it carries a second
   location for the affected code, or it marks a missing change anchored to the code that needs it.
3. A taste finding is dropped when it names no rules file, or quotes words that file does not hold,
   so a model cannot invent a taste rule. The quote matches with whitespace collapsed and case kept,
   so a quote across a line wrap still matches. The finding keeps the file and the nearest heading
   above the quote as its rule, which labels each rule's yield.
4. A PLAUSIBLE finding is dropped when it names no fact that the lens could not read, because that
   fact is what a reader must check.
5. A finding that fails the finding schema is dropped.

A title over the schema's length is cut short with an ellipsis, because the defect it names still
holds.

Two findings are one defect when their anchors overlap in one file and every word that one title
rests on is in the other title, after joining words and common endings drop. That catches a
reordered or shorter wording of one defect. A title that swaps a word, such as request for response,
can name a different defect, so Assemble keeps both findings for
[the merge pass](./pipeline.md#the-stages) to judge. A tests-lens finding merges only with another
tests-lens finding, because it asks for a test where the other lenses ask for a fix. The merged
finding keeps the higher severity. The result lists the findings by severity, then by path and line.

A line the change deleted has no head line of its own, so the static stage maps it to the head line
where it sat. Assemble reads the changed lines through the same function, so a lens finding and a
direct finding anchor a deletion to the same line. A finding counts as written by the change only
when its anchor holds an added line, because a finding beside a deletion is about code the change
left in place.

## Identity across re-reviews

A finding's ID is a hash of its lens, its anchor's path, its rule or criterion, and its normalised
title. The hash leaves the line numbers out, and the normalised title keeps only lowercase letters
and single spaces. A re-review that finds the same defect at a moved line, or words its title with a
different line number, therefore gives it the same ID. One defect reported at two places in one file
would hash to one ID, so each place after the first, in anchor order, hashes its place number into
its ID, and every ID stays unique in a review.

The ID is what a disposition attaches to. [The GitHub App](./github-app.md) reads a disposition from
the reply in a finding's thread and keys it by the ID, and [the findings store](./store.md) reopens
a `fixed` finding when a later review reports the same ID.

## The risk class on a finding

A finding whose anchor sits in the paths of a marked risk class carries that class's name. The
GitHub App refuses a `deferred` disposition on such a finding even in code the change did not write,
under [0009](../decisions/0009-the-merge-loop.md), because a defect beside a change to a risky path
needs an answer before the merge.
