# Pipeline

A review turns a change into findings and a check result in 6 stages.
[0002](../../decisions/0002-the-pipeline.md) records why the static stage comes before any model.

1. **Load.** The CLI reads the change (base and head commits), the merged config, and the rules
   file. It records the head commit, and every line reference cites that commit.
2. **Static stage.** The stage parses the changed files, builds the slices, finds the consumer
   edges, and reports direct findings. It is skipped when the change holds no code.
3. **Route.** Routing fires the correctness lens and every lens whose trigger matches, then computes
   the risk score and picks the depth.
4. **Call.** noslop groups the fired lenses into calls, builds each call's prompt from the fired
   lenses' sections, and sends each call through an adapter. A diff of more than 150 changed lines
   reaches each lens in chunks.
5. **Assemble.** noslop validates each call's output against its schema, drops findings that break
   the finding rules, merges duplicates, and keeps the higher severity of a merged pair. At Deep, a
   verify pass and a gap sweep run here.
6. **Report.** The CLI writes the findings as JSON. The GitHub App posts them as inline comments and
   a check run, and the findings store records them.

A confirmed P1 at Standard reruns stages 4 and 5 at Deep, once.

## What each stage reads and writes

| Stage        | Reads                                                         | Writes                                        |
| ------------ | ------------------------------------------------------------- | --------------------------------------------- |
| Load         | The change, `review.json` and its parents, the rules file     | The reviewed head, the merged config          |
| Static stage | Changed files at the head, the base index, consumer manifests | Slices, direct findings, consumer edges       |
| Route        | Slices, changed paths, risk classes                           | Fired lenses, the depth, the effort per lens  |
| Call         | Fired lenses, slices, hunks                                   | Raw lens output per call                      |
| Assemble     | Raw lens output                                               | Findings                                      |
| Report       | Findings                                                      | CLI JSON, comments, the check run, store rows |
