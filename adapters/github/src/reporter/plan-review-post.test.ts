import { expect, test } from 'bun:test';
import { buildMockFinding, buildMockReviewResult } from '@noslop/testing';
import { planReviewPost } from './plan-review-post';

test('it writes the first review of a pull request in full', () => {
  const finding = buildMockFinding({ id: '1111111111111111' });

  const plan = planReviewPost(
    { summary: null, posted: new Set(), recorded: [], unreadable: 0 },
    buildMockReviewResult({ reviewID: 'review-a', findings: [finding] }),
  );

  expect(plan).toStrictEqual({
    writesSummary: true,
    reviewIDs: ['review-a'],
    inline: [finding],
    carried: [],
  });
});

test('it writes a repost of the latest review without listing it again', () => {
  const plan = planReviewPost(
    {
      summary: {
        head: 'b'.repeat(40),
        reported: [],
        failedCalls: 0,
        confirmed: [],
        reviewIDs: ['review-a', 'review-b'],
        startedAt: '2026-10-17T10:05:00.000Z',
      },
      posted: new Set(),
      recorded: [],
      unreadable: 0,
    },
    buildMockReviewResult({ reviewID: 'review-b', startedAt: '2026-10-17T10:05:00.000Z' }),
  );

  expect(plan).toStrictEqual({
    writesSummary: true,
    reviewIDs: ['review-a', 'review-b'],
    inline: [],
    carried: [],
  });
});

test('it lists a fixes-only run among the reviews it wrote', () => {
  const plan = planReviewPost(
    {
      summary: {
        head: 'b'.repeat(40),
        reported: [],
        failedCalls: 0,
        confirmed: [],
        reviewIDs: ['review-a', 'review-b'],
        startedAt: '2026-10-17T10:05:00.000Z',
      },
      posted: new Set(),
      recorded: [],
      unreadable: 0,
    },
    buildMockReviewResult({
      reviewID: 'review-c',
      startedAt: '2026-10-17T10:10:00.000Z',
      fixesOnly: true,
      fixChecks: [{ findingID: '1111111111111111', fixed: true, reason: 'The guard is in place.' }],
    }),
  );

  expect(plan).toStrictEqual({
    writesSummary: true,
    reviewIDs: ['review-a', 'review-b', 'review-c'],
    inline: [],
    carried: [],
  });
});

test('it leaves the summary to a later review when a listed earlier review is retried', () => {
  const plan = planReviewPost(
    {
      summary: {
        head: 'b'.repeat(40),
        reported: [],
        failedCalls: 0,
        confirmed: [],
        reviewIDs: ['review-a', 'review-b'],
      },
      posted: new Set(),
      recorded: [],
      unreadable: 0,
    },
    buildMockReviewResult({
      reviewID: 'review-a',
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  expect(plan).toStrictEqual({
    writesSummary: false,
    reviewIDs: ['review-a', 'review-b'],
    inline: [],
    carried: [],
  });
});

test('it leaves the summary to a later review when an unlisted review that started before it is retried', () => {
  const plan = planReviewPost(
    {
      summary: {
        head: 'b'.repeat(40),
        reported: [],
        failedCalls: 1,
        confirmed: [],
        reviewIDs: ['review-b'],
        startedAt: '2026-10-17T10:05:00.000Z',
      },
      posted: new Set(),
      recorded: [],
      unreadable: 0,
    },
    buildMockReviewResult({
      reviewID: 'review-a',
      startedAt: '2026-10-17T10:00:00.000Z',
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  expect(plan).toStrictEqual({
    writesSummary: false,
    reviewIDs: ['review-b'],
    inline: [],
    carried: [],
  });
});

test.each([
  ['the same start time', '2026-10-17T10:05:00.000Z'],
  ['a later start time', '2026-10-17T10:10:00.000Z'],
])('it writes an unlisted review with %s as the summary shows', (_label, startedAt) => {
  const plan = planReviewPost(
    {
      summary: {
        head: 'b'.repeat(40),
        reported: [],
        failedCalls: 0,
        confirmed: [],
        reviewIDs: ['review-a'],
        startedAt: '2026-10-17T10:05:00.000Z',
      },
      posted: new Set(),
      recorded: [],
      unreadable: 0,
    },
    buildMockReviewResult({ reviewID: 'review-b', startedAt }),
  );

  expect(plan).toStrictEqual({
    writesSummary: true,
    reviewIDs: ['review-a', 'review-b'],
    inline: [],
    carried: [],
  });
});

test('it writes an unlisted review in full when the summary marker holds no start time', () => {
  const plan = planReviewPost(
    {
      summary: {
        head: 'b'.repeat(40),
        reported: [],
        failedCalls: 0,
        confirmed: [],
        reviewIDs: ['review-b'],
      },
      posted: new Set(),
      recorded: [],
      unreadable: 0,
    },
    buildMockReviewResult({ reviewID: 'review-a', startedAt: '2026-10-17T09:00:00.000Z' }),
  );

  expect(plan).toStrictEqual({
    writesSummary: true,
    reviewIDs: ['review-b', 'review-a'],
    inline: [],
    carried: [],
  });
});

test('it posts no finding that a comment already carries', () => {
  const fresh = buildMockFinding({ id: '3333333333333333' });

  const plan = planReviewPost(
    {
      summary: null,
      posted: new Set(['1111111111111111', '2222222222222222']),
      recorded: [],
      unreadable: 0,
    },
    buildMockReviewResult({
      reviewID: 'review-a',
      findings: [
        buildMockFinding({ id: '1111111111111111' }),
        buildMockFinding({ id: '2222222222222222' }),
        fresh,
      ],
    }),
  );

  expect(plan.inline).toStrictEqual([fresh]);
});

test('it posts each new finding on the pull request however many reviews came before', () => {
  const unwritten = buildMockFinding({ id: '1111111111111111', writtenByChange: false });
  const written = buildMockFinding({ id: '2222222222222222', writtenByChange: true });

  const plan = planReviewPost(
    {
      summary: {
        head: 'b'.repeat(40),
        reported: [],
        failedCalls: 0,
        confirmed: [],
        reviewIDs: ['review-a', 'review-b', 'review-c'],
      },
      posted: new Set(),
      recorded: [],
      unreadable: 0,
    },
    buildMockReviewResult({ reviewID: 'review-d', findings: [unwritten, written] }),
  );

  expect(plan.inline).toStrictEqual([unwritten, written]);
});

test('it carries each recorded finding that no comment or finding of the review holds', () => {
  const unposted = buildMockFinding({ id: '3333333333333333', anchorCommit: 'a'.repeat(40) });

  const plan = planReviewPost(
    {
      summary: null,
      posted: new Set(['1111111111111111']),
      recorded: [
        buildMockFinding({ id: '1111111111111111', anchorCommit: 'a'.repeat(40) }),
        buildMockFinding({ id: '2222222222222222', anchorCommit: 'a'.repeat(40) }),
        unposted,
      ],
      unreadable: 0,
    },
    buildMockReviewResult({
      reviewID: 'review-b',
      findings: [buildMockFinding({ id: '2222222222222222' })],
    }),
  );

  expect(plan.carried).toStrictEqual([unposted]);
});

test('it carries no recorded finding onto the pull request when a finding comment holds a marker noslop cannot read', () => {
  const plan = planReviewPost(
    {
      summary: null,
      posted: new Set(),
      recorded: [buildMockFinding({ id: '1111111111111111', anchorCommit: 'a'.repeat(40) })],
      unreadable: 1,
    },
    buildMockReviewResult({ reviewID: 'review-b', findings: [] }),
  );

  expect(plan.carried).toStrictEqual([]);
});
