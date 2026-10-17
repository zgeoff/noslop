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

test('it says there are no findings when the review found none', () => {
  expect(formatReviewSummary(buildMockReviewResult())).toInclude('\nno findings\n');
});
