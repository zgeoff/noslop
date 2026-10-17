# 0013: Prompt language

- Date: 2026-10-17
- Status: decided

Lens prompts and design pages use short numbered rules, plain words, and one idea per line. A rule
states what counts and what does not, with an example where one helps.

## Why

- A model follows a short plain rule more reliably than a long nuanced one.
- A reader can check a numbered rule against a finding.

## Alternatives

- **Long explanatory prose.** It hides the rule inside the explanation.

## Consequences

- Each lens page holds its rules as a numbered list that the prompt reuses.
