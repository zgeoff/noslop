# Findings

A finding is the unit every part of noslop passes on.
[0003](../../decisions/0003-what-counts-as-a-finding.md) sets what counts as a finding, and
[0004](../../decisions/0004-severity-and-verdicts.md) sets severity and verdicts. The zod schema
lives in `libs/contract`.

## Fields

| Field             | Holds                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `id`              | A stable ID: a hash of the lens, the anchor path, the rule or criterion, and the normalised title           |
| `lens`            | The lens ID, or `static` for a direct finding                                                               |
| `title`           | At most 80 characters, imperative                                                                           |
| `body`            | One paragraph: the defect, the inputs or state that trigger it, and the consequence                         |
| `anchor`          | `path`, `startLine`, `endLine` at the reviewed head; the range overlaps the diff and spans at most 10 lines |
| `secondLocation`  | Optional: `repo`, `commit`, `path`, `startLine`, `endLine` for affected code outside the diff               |
| `severity`        | `P1`, `P2` or `P3`                                                                                          |
| `criterion`       | The severity criterion the lens applied, from the table in 0004                                             |
| `rule`            | For a taste finding: the rule name from the rules file                                                      |
| `verdict`         | `CONFIRMED` or `PLAUSIBLE`                                                                                  |
| `unverifiedFact`  | For a PLAUSIBLE finding: the fact the lens could not read                                                   |
| `writtenByChange` | `true` when the anchor sits on a line the change added or changed                                           |
| `fix`             | Optional: one instruction for the fix                                                                       |

## Rules Assemble enforces

1. A finding with an anchor outside the diff is dropped.
2. A finding outside the diff with no `secondLocation` is dropped, unless it is a missing change
   anchored to the changed line that needs it.
3. A taste finding with no `rule`, or a `rule` that the rules file does not hold, is dropped.
4. A PLAUSIBLE finding with no `unverifiedFact` is dropped.
5. 2 findings with the same anchor and the same defect merge, and the merged finding keeps the
   higher severity.

## Identity across re-reviews

The `id` stays the same when a re-review finds the same defect at a moved line, so a disposition
carries over. A finding whose `id` matches a finding that holds `fixed` reopens that finding.
