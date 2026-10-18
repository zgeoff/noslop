import { expect, test } from 'bun:test';
import { formatPathCode } from './format-path-code';

test('it wraps a plain path in a code span', () => {
  expect(formatPathCode('src/a.ts')).toBe('`src/a.ts`');
});

test('it fences a path with backticks in a longer run of backticks', () => {
  expect(formatPathCode('data/a`b``c.json')).toBe('``` data/a`b``c.json ```');
});

test('it writes control characters and angle brackets as escapes', () => {
  expect(formatPathCode('a\n<b>')).toBe(`\`${['a', 'u000a', 'u003cb', 'u003e'].join('\\')}\``);
});
