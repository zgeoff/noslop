import { expect, test } from 'bun:test';
import { buildMockReviewResult } from '@noslop/testing';
import { formatSummaryComment } from './format-summary-comment';

test('it writes the head, depth, lenses, failed calls, fixes and marker of a re-review', () => {
  const result = buildMockReviewResult({
    base: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    depth: 'deep',
    lenses: ['correctness', 'security'],
    failedCalls: [{ id: 'B', lenses: ['security'], reason: 'codex timed out' }],
  });

  expect(
    formatSummaryComment(
      result,
      {
        head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        reviews: 2,
        reported: [],
        failedCalls: 1,
        followUps: [],
        confirmed: ['1111111111111111:abc1234'],
      },
      [{ id: '1111111111111111', title: 'Await the write', commit: 'abc1234', fixed: true }],
    ),
  ).toMatchInlineSnapshot(`
    "### noslop

    Re-reviewed (review 2) \`aaaaaaaaaaaa\` against \`bbbbbbbbbbbb\` at deep depth.

    - Lenses: correctness, security
    - Findings: 0
    - Failed call \`B\` (security): codex timed out

    **Fixes**

    - \`1111111111111111\` Await the write: fixed

    <!-- noslop:summary {"head":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","reviews":2,"reported":[],"failedCalls":1,"followUps":[],"confirmed":["1111111111111111:abc1234"]} -->"
  `);
});
