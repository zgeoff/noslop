# Routing and depth

Routing fires the lenses, and the risk score picks the depth.
[0006](../../decisions/0006-routing.md) holds the trigger table and the special changes, and
[0007](../../decisions/0007-depth-and-models.md) holds the Light and Deep rules. This page covers
how routing computes them.

## Firing a lens

1. The correctness lens fires on every change that holds code.
2. Each other lens fires when its trigger matches a non-empty slice or a changed path.
3. A marked risk class fires every lens it forces on.
4. A lens with `enabled: false` in the config never fires, except when a risk class forces it.
5. A special change (a sync, a release bump, docs only, a direct push) replaces steps 1 to 3 with
   its own lens list.

## Picking the depth

Routing checks Deep first, then Light, and every other change is Standard. Every threshold comes
from `thresholds` in the config.

| Depth    | Effort   | Passes                                                                                                                                                  |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Light    | `low`    | Every fired lens in 1 call                                                                                                                              |
| Standard | `medium` | The calls in the grouping                                                                                                                               |
| Deep     | `high`   | The calls with call A split, then a verify pass, then a gap sweep on a change of 5 or more files or 200 or more lines when no blocking finding survives |

## Stepping up

A CONFIRMED P1 at Standard reruns the calls at Deep once. The result records both depths. A Light
review never steps up: a Light review that finds a P1 records it, and the history gate in
[the eval harness](eval.md) catches a Light rule that lets P1s through.

## Chunking

A diff of more than `chunkLines` changed lines reaches each lens in chunks. A chunk holds whole
files, grouped by package, up to `chunkLines` lines. A single file larger than `chunkLines` is its
own chunk. Each chunk is a separate call, and Assemble merges their findings.
