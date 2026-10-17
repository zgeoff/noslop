# Instructions

- Trigger: a changed agent instruction file
- Input: the hunks; the `instructions` slice, with every file loaded beside the changed one
- Call: G

## Prompt

Find what an agent will now do differently because of this change, and where that goes wrong.

Look for:

1. A new rule that conflicts with a rule in another file the agent loads.
2. A rule an agent cannot follow with the tools and permissions it has.
3. A rule that, followed by 2 sessions at once, makes them collide on a shared resource.
4. A rule that depends on live state it does not name, such as a service being up.
5. A rule that reads 2 ways.

Check each candidate:

1. Quote the new rule and the rule it conflicts with, each with its file.
2. Describe the agent's first run under the rule in one sentence.

Do not report:

1. Wording style, unless the wording makes the rule read 2 ways.

Severity: P2.
