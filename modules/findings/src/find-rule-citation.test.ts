import { expect, test } from 'bun:test';
import { findRuleCitation } from './find-rule-citation';

test('it names the file and the nearest heading above the quote', () => {
  expect(
    findRuleCitation(
      [
        {
          name: 'skills/code/SKILL.md',
          body: '# Code\n\n## Names\n\nStart a name with a verb.\n\n### Acronyms\n\nKeep ID uppercase.',
        },
      ],
      'skills/code/SKILL.md',
      'Start a name with a verb.',
    ),
  ).toBe('skills/code/SKILL.md: Names');
});

test('it names the file alone when no heading sits above the quote', () => {
  expect(
    findRuleCitation(
      [{ name: 'RULES.md', body: 'Start a name with a verb.\n\n## Later\n\nMore.' }],
      'RULES.md',
      'Start a name with a verb.',
    ),
  ).toBe('RULES.md');
});

test('it finds a quote that the file wraps across lines', () => {
  expect(
    findRuleCitation(
      [
        {
          name: 'RULES.md',
          body: '## Names\n\nStart each function name\nwith a verb from the list.',
        },
      ],
      'RULES.md',
      'Start each function name with a verb from the list.',
    ),
  ).toBe('RULES.md: Names');
});

test('it finds no rule for a quote the file does not hold', () => {
  expect(
    findRuleCitation(
      [{ name: 'RULES.md', body: '## Names\n\nStart a name with a verb.' }],
      'RULES.md',
      'start a name with a verb.',
    ),
  ).toBeNull();
});

test('it finds no rule for a file that no rule names', () => {
  expect(
    findRuleCitation(
      [{ name: 'RULES.md', body: '## Names\n\nStart a name with a verb.' }],
      'OTHER.md',
      'Start a name with a verb.',
    ),
  ).toBeNull();
});

test('it finds the quote in the second of 2 files that share a label', () => {
  expect(
    findRuleCitation(
      [
        { name: 'RULES.md', body: '## Shared\n\nStart a name with a verb.' },
        { name: 'RULES.md', body: '## Project\n\nKeep the store in one file.' },
      ],
      'RULES.md',
      'Keep the store in one file.',
    ),
  ).toBe('RULES.md: Project');
});

test('it finds no rule for an empty quote', () => {
  expect(
    findRuleCitation([{ name: 'RULES.md', body: 'Start a name with a verb.' }], 'RULES.md', ' '),
  ).toBeNull();
});

test('it reads a heading inside a code block as no heading of the file', () => {
  expect(
    findRuleCitation(
      [
        {
          name: 'RULES.md',
          body: '## Comments\n\n```markdown\n## Not a heading\n```\n\nCut the filler.',
        },
      ],
      'RULES.md',
      'Cut the filler.',
    ),
  ).toBe('RULES.md: Comments');
});
