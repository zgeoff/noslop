import { expect, test } from 'bun:test';
import { parseCodexReview } from './parse-codex-review';

test('it reads each finding with its path relative to the worktree', () => {
  const text = [
    'A reproducer confirmed the regression.',
    '',
    'Review comment:',
    '',
    '- [P1] Restore the equality check for the divisor — /work/case/m.ts:2-4',
    '  The assignment sets `b` to zero for every call.',
    '- [P2] Keep the row until the write succeeds — /work/case/src/queue.ts:10',
    '  The loop deletes the row first.',
  ].join('\n');

  expect(parseCodexReview(text, '/work/case')).toStrictEqual([
    {
      lens: null,
      title: 'Restore the equality check for the divisor',
      severity: 'P1',
      anchor: { path: 'm.ts', startLine: 2, endLine: 4 },
    },
    {
      lens: null,
      title: 'Keep the row until the write succeeds',
      severity: 'P2',
      anchor: { path: 'src/queue.ts', startLine: 10, endLine: 10 },
    },
  ]);
});

test('it reads a P0 finding as P1', () => {
  expect(parseCodexReview('- [P0] Stop the outage — src/a.ts:1-1', '/work')).toStrictEqual([
    {
      lens: null,
      title: 'Stop the outage',
      severity: 'P1',
      anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
    },
  ]);
});

test('it reads a review with no findings as an empty list', () => {
  expect(parseCodexReview('The change looks correct. No findings.', '/work')).toStrictEqual([]);
});
