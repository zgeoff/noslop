import { expect, test } from 'bun:test';
import { buildMockFinding, buildMockReviewResult } from '@noslop/testing';
import { formatReviewSummary } from './format-review-summary';

test('it lists what ran, each finding at its anchor and each failed call', () => {
  const text = formatReviewSummary(
    buildMockReviewResult({
      depth: 'deep',
      findings: [buildMockFinding()],
      failedCalls: [{ id: 'B', lenses: ['security'], reason: 'codex timed out' }],
    }),
  );

  expect(text).toMatchInlineSnapshot(`
    "noslop reviewed bbbbbbbbbbbb at deep with 1 calls
    lenses: correctness

    P2 CONFIRMED src/a.ts:1 [correctness] Return the total of every item
    failed call B (security): codex timed out
    "
  `);
});

test('it lists each file the review did not read with its reason', () => {
  const text = formatReviewSummary(
    buildMockReviewResult({
      notReviewed: [
        { path: 'samples/corpus.jsonl', reason: 'data' },
        { path: 'samples/big.json', reason: 'too-large' },
      ],
    }),
  );

  expect(text).toEndWith(
    [
      'no findings',
      'not reviewed: data file: samples/corpus.jsonl',
      'not reviewed: too large: samples/big.json',
      '',
    ].join('\n'),
  );
});

test('it prints the control characters of a file name as escapes', () => {
  const text = formatReviewSummary(
    buildMockReviewResult({
      notReviewed: [{ path: `data/x\n${String.fromCodePoint(0x1b)}[31mred.json`, reason: 'data' }],
    }),
  );

  expect(text).toEndWith(
    `${['not reviewed: data file: data/x', 'u000a', 'u001b[31mred.json'].join('\\')}\n`,
  );
});

test('it says there are no findings when the review found none', () => {
  expect(formatReviewSummary(buildMockReviewResult())).toInclude('\nno findings\n');
});
