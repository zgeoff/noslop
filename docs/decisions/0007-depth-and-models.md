# 0007: Depth and models

- Date: 2026-10-17
- Status: decided

A risk score picks one of 3 depths from signals that need no model. Depth sets the default model effort: low for Light, medium for Standard, high for Deep.

A change is Light only when all of these hold:

1. No risk class is marked, and no static risk slice fires.
2. It touches 1 package and no consumer edge.
3. It changes 50 lines or fewer of non-generated code, or only tests, or only docs.
4. It deletes no lines in a path that a risk class forces a lens on.
5. No file in it has a past escape.

A change is Deep when any of these holds:

1. A risk class is marked.
2. It deletes lines in a path that a risk class forces a lens on.
3. It touches 3 or more packages.
4. Its title carries a breaking marker.
5. It hits a consumer edge in another repo.

Every other change is Standard. Deep adds a verify pass, which re-derives each finding from the code, and a gap sweep, which looks for what the other findings miss on a change of 5 or more files or 200 or more lines. A confirmed P1 at Standard steps the review up to Deep once. At every depth, a diff of more than 150 changed lines reaches each lens in chunks by file or package.

## Why

- Effort costs time and tokens, so low-risk changes get less of it.
- A deterministic score gives the same depth on every run.
- Recall falls on large diffs, so chunks keep each lens's input small.

## Alternatives

- **One depth for every change.** It overspends on small changes or underspends on risky ones.
- **A model rates the risk.** It costs a call and can rate the same change differently.

## Consequences

- The Light rule must pass a history test before it goes live: on a labelled corpus, Light holds about none of the past P1s and escapes.
- Model and effort can be overridden per lens, under [0010](0010-the-reviewer-config.md).
