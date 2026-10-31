# Running the eval

`noslop eval` replays a labelled corpus of past changes through noslop with the config of the repo
you run it from, and scores each lens against the labels. Run it before and after a change to a
prompt, the call grouping or a threshold, and compare the two reports. The harness reports counts
and decides nothing. [The eval harness](../architecture/measurement/eval.md) owns how it replays,
matches and scores.

## Build a corpus

noslop ships no corpus, so you build one from your own past changes, and keep it outside the noslop
repo.

1. Make a corpus folder with one folder per case. The harness loads the cases in folder-name order,
   and skips a folder with no `case.json`.
2. Keep a local clone of each repo a case comes from. The harness runs git in it, and checks out
   each head in a worktree of its own, so the clone's checkout never moves.
3. Write a `case.json` in each case folder. A case holds:
   - `id`, the name the report and the runs use for it.
   - `repo`, the absolute path to the local clone.
   - `base` and `head`, the full 40-character shas of the change.
   - `title` and `body`, the change's title and description.
   - `reviewedHead`, optional: the full sha of the head an earlier review of the pull request
     covered. Set it to replay the case as a re-review of the push from that head to `head`. Keep
     `base`, `title` and `body` as the whole pull request has them.
   - `linkedIssue`, optional: the text of the issue the change closes. The intent lens runs only on
     a case that holds one.
   - `findings`, the labelled findings: each one an `anchor` with `path`, `startLine` and `endLine`,
     a `title`, a `severity`, the `lens` it belongs to or `null`, and a `label` of `true-positive`,
     `false-positive` or `disputed`.
   - `escapes`, the defects a review missed: each one a `defect`, `visibleInDiff`, and an `anchor`
     and a `lens` when you know them.
   - `silences`, optional: the lenses the case expects to report no finding, such as a lens that
     raised a false positive on the change. Each one is a `lens`, a `reason`, and an `anchor` when
     the silence covers only the lines near it. A silence with no anchor covers the whole change.
   - `fixes`, optional: the posted findings an author replied `fixed` to. A case with `fixes` is a
     fix-check case. The eval runs no lens on it: it runs the
     [fix check](../architecture/output/fixes-only-run.md) of each finding, the one model call that
     judges whether the head fixes the finding. Set `head` to the pull request head that the live
     fix check judged, and keep `findings` and `escapes` empty. Each entry of `fixes` holds these
     fields:

     | Field        | Holds                                                                                   |
     | ------------ | --------------------------------------------------------------------------------------- |
     | `id`         | the finding's 16-character id                                                           |
     | `title`      | the finding's title                                                                     |
     | `lens`       | the lens that reported the finding                                                      |
     | `path`       | the file the finding sits in                                                            |
     | `line`       | the line the review posted the finding on, or `null` for a file-level one               |
     | `comment`    | the text of the finding's review comment                                                |
     | `postedHead` | the head commit of the review that posted the finding, or `null`                        |
     | `commit`     | the sha the author's reply names, short or full, or `null` for a reply of `fixed` alone |
     | `expected`   | the verdict the fix check should give: `fixed` or `not-fixed`                           |

Label the findings a reference reviewer made on the change by what happened to each one, so the
corpus records which findings were real.

## Run it

1. Check that the corpus loads, and see the depth each case routes to, with no model call:

   ```bash
   noslop eval --corpus <corpus_folder> --static
   ```

   Expect a report that starts with `# Static depth replay`, then
   `<count> cases, <count> failed to plan.`. A case that fails its schema stops the run with
   `case <folder> is not a valid case:` and the schema errors. The static replay skips the
   labelled-path check, so a missing path shows only in the next step.

2. Replay a few cases to check the setup before a whole run:

   ```bash
   noslop eval --corpus <corpus_folder> --limit 2 --out <out_folder> --verbose
   ```

   Expect a log line on stderr as each case ends, `case <id>: <count> findings`, which reads
   `case <id>: failed findings` for a failed case. A labelled path that names no file at the case's
   head stops the run before any review, with the case and the paths.

3. Replay the whole corpus into a fresh out folder:

   ```bash
   noslop eval --corpus <corpus_folder> --out <out_folder>
   ```

   The run uses the adapter the config sets, and `--adapter` replaces it. Without `--out`, the run
   goes to a new folder under the cache folder, `eval/run-<timestamp>`.

4. When a run stops partway, rerun the same command with `--resume`. It keeps the cases `runs.json`
   holds and replays only the rest.

The out folder holds three files when the run ends:

- `runs.json`, the recorded run, written again as each case ends.
- `report.md`, the report for a person, which the command also prints.
- `score.json`, the score as JSON, which `--json` prints in place of the report.

Keep `runs.json`. A later eval reads it as a baseline or as half of a noise floor.

## Compare against a baseline

1. Score a recorded run beside the new one:

   ```bash
   noslop eval --corpus <corpus_folder> --baseline <runs_file>
   ```

   Expect a second column, `baseline`, in the totals table. The baseline is scored only on the cases
   of this run.

2. Measure the noise floor from two recorded runs of one reviewer on the same cases:

   ```bash
   noslop eval --corpus <corpus_folder> --noise-floor <first_runs_file>,<second_runs_file>
   ```

   Expect a `## Noise floor` section that gives each run's finding count, the matches between them,
   and the agreement.

3. To see what depth adds, run the corpus twice with `--depth light` and `--depth deep`, each into
   its own out folder, and compare the two reports.

## Read the report

The report opens with `# Eval: <reviewer>` and `<count> cases, <count> failed.`. A failed case
threw, or every one of its calls failed, so read that count first: a run with many failed cases says
little about the config.

The totals table counts, across all cases:

- the labelled true positives the run repeated, out of all of them;
- the findings reported, and how many matched no label;
- the escapes caught, out of the escapes with an anchor;
- the silences broken, out of the silences whose lens ran;
- the calls, the four token counts, and the duration.

`## Light rule` counts the cases noslop reviewed at Light and the labelled P1s and escapes in them.
Each one is a defect the cheapest review could let through, and
[0007](../decisions/0007-depth-and-models.md) records why that count should stay near none.

`## Per lens` gives one row per lens. Read it column by column:

| Column                  | Counts                                                                       |
| ----------------------- | ---------------------------------------------------------------------------- |
| Baseline true positives | the true positives the corpus labels with this lens                          |
| Repeated                | those the run matched with a finding of any lens                             |
| Reported                | the findings this lens reported                                              |
| Matched true            | its findings that matched a `true-positive` label                            |
| Matched false           | its findings that matched a `false-positive` label                           |
| Disputed                | its findings that matched a `disputed` label                                 |
| Unlabelled              | its findings that matched no label                                           |
| Escapes caught          | the escapes its findings matched                                             |
| Silences broken         | the silences of this lens that one of its findings broke, out of all of them |

A lens that reports more and matches more false positives grew noisier. An unlabelled finding is
unscored, not wrong: read a sample of them before you judge the lens, and label the real ones into
the corpus. A finding with no lens counts under `unknown`.

When the corpus holds a fix-check case, the report ends with `## Fix checks`: a count of the fix
checks that gave the expected verdict, then one row per entry of `fixes` with its case, finding,
expected verdict, the verdict the run gave and the reason. A verdict of `unjudged` means that the
fix check failed, that the fix went over the config's `maxFileChars` limit, or that no fix check
ran.

A gap between two runs means something only when it is larger than the noise floor. Two runs of one
config differ on their own, so measure the floor once per corpus and reviewer, and judge every
comparison against it.
