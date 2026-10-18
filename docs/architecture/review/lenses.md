# Lenses

A lens is one review concern, such as correctness, security or reuse, with its own trigger, the
slices it reads, and a prompt section that asks a model for that kind of defect.
[0005](../../decisions/0005-the-lens-set.md) sets the lens set, and a call to a model carries the
sections of the lenses that fired, joined into one prompt. Each lens reports into its own findings
list, so every finding keeps the lens that found it. The lenses package owns the prompts and builds
each call's prompt. Routing decides which lenses fire and which call carries them, and an adapter
sends the prompt to a model CLI.

## The prompt pages

Each lens has a Markdown page in the lenses package. A page opens with a header for the people who
edit it: the trigger, the input and the call. The prompt follows under its `## Prompt` heading, and
the model reads that text word for word, so an edit to a page is an edit to the prompt. The model
never sees the header, because the trigger and the input are rules that noslop runs in code. The
pages follow [0013](../../decisions/0013-prompt-language.md): short numbered rules in plain words,
each page with what to look for, how to check each candidate, what not to report, and the severity.

A shared header page opens every call. It holds the finding rules of
[0003](../../decisions/0003-what-counts-as-a-finding.md), the verdict rules of
[0004](../../decisions/0004-severity-and-verdicts.md), and the form of the answer. The criteria
table of 0004 enters the header from the code that sets each criterion's severity, so the table the
model reads and the check that Assemble runs come from one source.

## Building a call's prompt

A call's prompt has 3 parts, in this order:

1. The shared header.
2. One section per lens, in the order routing gives, each under a heading with the lens ID that keys
   its findings list.
3. The input that the call's lenses read.

Each lens declares what it reads beside its section: the kinds of changed file whose hunks it needs,
the slices it needs, and whether it reads the rules file. Every call holds the pull request text and
the linked issue, because every lens must tell a change made on purpose from a defect. A call joins
the declarations of its lenses, so the prompt holds each slice once however many of its lenses read
it. A slice that lists entries keeps only the entries on the files in the call, so a lens never
reads about a file whose hunks it cannot see. The comment density covers the whole change and stays
whole.

The hunks carry the head line number beside every line that the head commit holds, and a deleted
line carries none. A lens anchors each finding to a line number it reads, so the anchors that come
back point at the reviewed head.

When a lens reads the rules file and the repo names none, the prompt says so and tells the lenses to
report no taste finding. A taste finding needs a rule from that file under 0003, so the prompt keeps
the model from inventing one.
