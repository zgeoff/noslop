# 0007: Depth and models

- Date: 2026-10-17
- Status: decided
- Updated: 2026-10-17

A risk score picks one of 3 depths from signals that need no model. Depth sets the default model
effort: low for Light, medium for Standard, high for Deep.

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

Every other change is Standard. Deep adds 1 verify call, which re-derives every finding from the
code after the findings merge, and at most 1 gap sweep call, which looks for what the other findings
miss on a change of 5 or more files or 200 or more lines. A confirmed P1 at Standard steps the
review up to Deep once, by running only the verify call on the findings it has. At every depth, each
call reads the whole change.

## Why

- Effort costs time and tokens, so low-risk changes get less of it.
- A deterministic score gives the same depth on every run.
- A reviewer must see the whole change to judge it, so no call splits the diff.
- A usable review beats the most thorough one, so Deep adds 2 calls at most, and fewer calls win a
  tie.

## Alternatives

- **One depth for every change.** It overspends on small changes or underspends on risky ones.
- **A model rates the risk.** It costs a call and can rate the same change differently.
- **Chunks of 150 changed lines by file or package.** A lens then sees part of the change, and the
  calls multiply: 93 calls on one corpus change, for no measured gain in recall.

## Consequences

- The Light rule must pass a history test before it goes live: on a labelled corpus, Light holds
  about none of the past P1s and escapes.
- Model and effort can be overridden per lens, under [0010](0010-the-reviewer-config.md).

## Changes

- 2026-10-17: dropped the 150-line chunk rule, so each call reads the whole change. A reviewer must
  see the whole change, and chunking multiplied the calls for no measured gain.
- 2026-10-17: Deep runs 1 verify call on the merged findings, not 1 per call, and at most 1 gap
  sweep call. A step-up from Standard runs only the verify call, and no longer reruns every call at
  Deep.
