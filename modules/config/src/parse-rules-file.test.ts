import { expect, test } from 'bun:test';
import { parseRulesFile } from './parse-rules-file';

test('it reads each level-2 and level-3 heading as a rule with its body', () => {
  expect(
    parseRulesFile(
      [
        '# Patterns',
        '',
        'An intro that is no rule.',
        '',
        '## Context goes last',
        '',
        '1. A function takes its context last.',
        '',
        '### No positional booleans',
        '',
        '1. Pass an options object.',
      ].join('\n'),
    ),
  ).toStrictEqual([
    { name: 'Context goes last', body: '1. A function takes its context last.' },
    { name: 'No positional booleans', body: '1. Pass an options object.' },
  ]);
});

test('it keeps a heading inside a code block in the body of its rule', () => {
  expect(
    parseRulesFile(['## Comment style', '', '```markdown', '## Not a rule', '```'].join('\n')),
  ).toStrictEqual([{ name: 'Comment style', body: '```markdown\n## Not a rule\n```' }]);
});

test('it keeps a shorter fence inside a longer one in the body of its rule', () => {
  expect(
    parseRulesFile(
      ['## Fences', '', '````markdown', '```', '## Not a rule', '```', '````'].join('\n'),
    ),
  ).toStrictEqual([{ name: 'Fences', body: '````markdown\n```\n## Not a rule\n```\n````' }]);
});

test('it reads a file with no rule headings as no rules', () => {
  expect(parseRulesFile('# Title\n\nSome prose.')).toStrictEqual([]);
});
