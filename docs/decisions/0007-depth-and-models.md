# 0007: Depth and models

- Date: 2026-10-17
- Status: decided
- Updated: 2026-10-18

A risk score picks one of 3 depths from signals that need no model. Depth sets the default model
effort: low for Light, medium for Standard, high for Deep.

A change is Light only when all of these hold:

1. No risk class is marked, and no static risk slice fires.
2. It changes no infra file.
3. It touches 2 packages or fewer, and no consumer edge.
4. It changes 400 lines or fewer of non-generated code, or only tests, or only docs.
5. No file in it has a past escape.

A change is Deep when any of these holds:

1. A marked risk class has 100 changed lines or more in the class's own paths.
2. It deletes 50 lines or more in the paths that risk classes force lenses on.
3. It touches 6 or more packages.
4. Its title carries a breaking marker.
5. It hits a consumer edge in another repo.

A risk class that does not reach Deep still fires the lenses it forces, at Standard. Each number
here is a default that the config sets.

Every other change is Standard. Deep runs the same lens calls as Standard at high effort, and adds
no call. A review runs at the depth the score picks and never steps up to another one. At every
depth, each call reads the whole change.

At every depth, a review with 2 or more model findings ends with 1 merge pass call on a cheap model.
The call groups the findings that report one defect, and the review keeps one finding of each group
in each file. The config can turn the pass off.

## Why

- Effort costs time and tokens, so low-risk changes get less of it.
- A deterministic score gives the same depth on every run.
- A reviewer must see the whole change to judge it, so no call splits the diff.
- A usable review beats the most thorough one, so Deep adds effort and no call, and fewer calls win
  a tie.
- A risk class path or detector alone marks most changes in a fleet of infra and tools repos, so
  Deep needs weight in the class's own paths. On a uniform sample of 200 merged pull requests, the
  rules route 40% Light, 50% Standard and 10% Deep. On the 266 corpus changes that hold a labelled
  defect, Light holds 3 of the 46 labelled P1s and 10 of the escapes.
- An infra change deploys or provisions, so its effect reaches past its line count, and it is never
  Light. On the corpus, 5 of the 6 labelled defects that Light held under a 50-line limit were on
  infra changes.

## Alternatives

- **One depth for every change.** It overspends on small changes or underspends on risky ones.
- **A model rates the risk.** It costs a call and can rate the same change differently.
- **Chunks of 150 changed lines by file or package.** A lens then sees part of the change, and the
  calls multiply: 93 calls on one corpus change, for no measured gain in recall.
- **Any marked risk class makes a change Deep.** It routed 40% of the fleet sample and 64% of the
  corpus to Deep, most of it from a detector or one touched path.
- **No line limit on Light.** With class marks and consumer edges allowed at Light too, it reached
  51% Light on the fleet sample, and Light held 6 labelled P1s and 25 escapes.
- **A gap sweep at Deep.** One call with every fired lens and the findings so far, asking for what
  they miss. On 6 corpus cases forced to Deep, it added 6 calls and 3.5M input tokens and found no
  labelled defect that the first pass missed.
- **A verify call at Deep, and a step-up to it from Standard on a confirmed P1.** One call
  re-derived each merged finding from the code, and its findings replaced the first pass's. On the 3
  Deep corpus runs with findings, 11 findings went in, verify dropped none and reworded 1 title, so
  the call cost a model call for no change in what the review reports.

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
- 2026-10-18: added the merge pass at every depth. Lenses word one defect differently, and a title
  rule cannot tell a reworded repeat from 2 defects whose titles differ by one word.
- 2026-10-18: removed the gap sweep. On the thin eval it found no labelled defect that the first
  pass missed, at 6 calls and 3.5M input tokens over 6 cases.
- 2026-10-18: an infra change is never Light.
- 2026-10-18: retuned the depth rules on a static replay. A marked risk class makes a change Deep
  only with 100 changed lines in its paths, a forced-path deletion only at 50 deleted lines, and
  packages only at 6. Light allows 2 packages and 400 code lines.
- 2026-10-18: removed the verify call at Deep and the step-up from Standard. Deep is the same lens
  calls at high effort. On 3 Deep runs, verify took 11 findings, dropped 0 and reworded 1 title.
