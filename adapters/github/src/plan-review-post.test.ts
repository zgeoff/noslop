import { expect, test } from 'bun:test';
import { buildMockFinding, buildMockReviewResult } from '@noslop/testing';
import { planReviewPost } from './plan-review-post';

test('it writes the first review of a pull request in full and counts it', () => {
  const finding = buildMockFinding({ id: '1111111111111111' });

  const plan = planReviewPost(
    { summary: null, posted: new Set() },
    buildMockReviewResult({ reviewID: 'review-a', findings: [finding] }),
  );

  expect(plan).toStrictEqual({
    writesSummary: true,
    reviews: 1,
    reviewIDs: ['review-a'],
    inline: [finding],
    followUps: [],
  });
});

test('it counts a repost of the latest review as no new review', () => {
  const plan = planReviewPost(
    {
      summary: {
        head: 'b'.repeat(40),
        reviews: 2,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
        reviewIDs: ['review-a', 'review-b'],
        startedAt: '2026-10-17T10:05:00.000Z',
      },
      posted: new Set(),
    },
    buildMockReviewResult({ reviewID: 'review-b', startedAt: '2026-10-17T10:05:00.000Z' }),
  );

  expect(plan).toStrictEqual({
    writesSummary: true,
    reviews: 2,
    reviewIDs: ['review-a', 'review-b'],
    inline: [],
    followUps: [],
  });
});

test('it posts no finding and counts no new review for a fixes-only run', () => {
  const finding = buildMockFinding({ id: '1111111111111111' });

  const plan = planReviewPost(
    {
      summary: {
        head: 'b'.repeat(40),
        reviews: 2,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
        reviewIDs: ['review-a', 'review-b'],
        startedAt: '2026-10-17T10:05:00.000Z',
      },
      posted: new Set(),
    },
    buildMockReviewResult({
      reviewID: 'review-c',
      startedAt: '2026-10-17T10:10:00.000Z',
      findings: [finding],
    }),
    true,
  );

  expect(plan).toStrictEqual({
    writesSummary: true,
    reviews: 2,
    reviewIDs: ['review-a', 'review-b', 'review-c'],
    inline: [],
    followUps: [],
  });
});

test('it leaves the summary to a later review when a counted earlier review is retried', () => {
  const plan = planReviewPost(
    {
      summary: {
        head: 'b'.repeat(40),
        reviews: 2,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
        reviewIDs: ['review-a', 'review-b'],
      },
      posted: new Set(),
    },
    buildMockReviewResult({
      reviewID: 'review-a',
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  expect(plan).toStrictEqual({
    writesSummary: false,
    reviews: 2,
    reviewIDs: ['review-a', 'review-b'],
    inline: [],
    followUps: [],
  });
});

test('it leaves the summary to a later review when an uncounted review that started before it is retried', () => {
  const plan = planReviewPost(
    {
      summary: {
        head: 'b'.repeat(40),
        reviews: 1,
        reported: [],
        failedCalls: 1,
        followUps: [],
        confirmed: [],
        reviewIDs: ['review-b'],
        startedAt: '2026-10-17T10:05:00.000Z',
      },
      posted: new Set(),
    },
    buildMockReviewResult({
      reviewID: 'review-a',
      startedAt: '2026-10-17T10:00:00.000Z',
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  expect(plan).toStrictEqual({
    writesSummary: false,
    reviews: 1,
    reviewIDs: ['review-b'],
    inline: [],
    followUps: [],
  });
});

test.each([
  ['the same start time', '2026-10-17T10:05:00.000Z'],
  ['a later start time', '2026-10-17T10:10:00.000Z'],
])('it writes an uncounted review with %s as the summary shows', (_label, startedAt) => {
  const plan = planReviewPost(
    {
      summary: {
        head: 'b'.repeat(40),
        reviews: 1,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
        reviewIDs: ['review-a'],
        startedAt: '2026-10-17T10:05:00.000Z',
      },
      posted: new Set(),
    },
    buildMockReviewResult({ reviewID: 'review-b', startedAt }),
  );

  expect(plan).toStrictEqual({
    writesSummary: true,
    reviews: 2,
    reviewIDs: ['review-a', 'review-b'],
    inline: [],
    followUps: [],
  });
});

test('it writes an uncounted review in full when the summary marker holds no start time', () => {
  const plan = planReviewPost(
    {
      summary: {
        head: 'b'.repeat(40),
        reviews: 1,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
        reviewIDs: ['review-b'],
      },
      posted: new Set(),
    },
    buildMockReviewResult({ reviewID: 'review-a', startedAt: '2026-10-17T09:00:00.000Z' }),
  );

  expect(plan).toStrictEqual({
    writesSummary: true,
    reviews: 2,
    reviewIDs: ['review-b', 'review-a'],
    inline: [],
    followUps: [],
  });
});

test('it posts no finding that a comment or a follow-up issue already carries', () => {
  const fresh = buildMockFinding({ id: '3333333333333333' });

  const plan = planReviewPost(
    { summary: null, posted: new Set(['1111111111111111', '2222222222222222']) },
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

test('it files each new finding outside security in code the change did not write as a follow-up after the re-check', () => {
  const unwritten = buildMockFinding({ id: '1111111111111111', writtenByChange: false });

  const security = buildMockFinding({
    id: '2222222222222222',
    lens: 'security',
    writtenByChange: false,
  });

  const written = buildMockFinding({ id: '3333333333333333', writtenByChange: true });

  const plan = planReviewPost(
    {
      summary: {
        head: 'b'.repeat(40),
        reviews: 2,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
        reviewIDs: ['review-a', 'review-b'],
      },
      posted: new Set(),
    },
    buildMockReviewResult({ reviewID: 'review-c', findings: [unwritten, security, written] }),
  );

  expect(plan).toStrictEqual({
    writesSummary: true,
    reviews: 3,
    reviewIDs: ['review-a', 'review-b', 'review-c'],
    inline: [security, written],
    followUps: [unwritten],
  });
});

test('it files no follow-up on the one re-check', () => {
  const unwritten = buildMockFinding({ id: '1111111111111111', writtenByChange: false });

  const plan = planReviewPost(
    {
      summary: {
        head: 'b'.repeat(40),
        reviews: 1,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
        reviewIDs: ['review-a'],
      },
      posted: new Set(),
    },
    buildMockReviewResult({ reviewID: 'review-b', findings: [unwritten] }),
  );

  expect(plan.followUps).toStrictEqual([]);
});
