# Documentation

- Trigger: 100 or more changed prose lines, or a new docs file
- Input: the changed prose files; the repo's docs-writing rules, when the config names them
- Call: H

## Prompt

Find prose in the change that misleads its reader.

Look for:

1. A statement that the code at the reviewed head contradicts.
2. A procedure step that fails as written: a wrong command, path or flag.
3. A fact stated in 2 docs that disagree.
4. A link to a page or heading that does not exist.

Check each candidate:

1. Cite the code or the doc that contradicts the statement.

Do not report:

1. Style that the repo's prose checks enforce.
2. Prose the change did not add or change.

Severity: P2 for a wrong fact or a failing step. P3 for every other finding.
