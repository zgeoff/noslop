import { expect, test } from 'bun:test';
import { buildMockReviewResult } from '@noslop/testing';
import { buildReviewedChange } from './build-reviewed-change';

test('it vouches for the head of a lens review', () => {
  expect(
    buildReviewedChange(
      buildMockReviewResult({
        failedCalls: [{ id: 'security', lenses: ['security'], reason: 'codex timed out' }],
      }),
      null,
    ),
  ).toStrictEqual({ kind: 'own', failedCalls: 1 });
});

test('it vouches for the head of a fixes-only run that judged a fix after a clean lens review', () => {
  expect(
    buildReviewedChange(
      buildMockReviewResult({
        fixesOnly: true,
        fixChecks: [
          { findingID: '1111111111111111', fixed: false, reason: 'The separator is still empty.' },
        ],
      }),
      {
        head: 'b'.repeat(40),
        reviews: 2,
        reported: [],
        failedCalls: 0,
        followUps: [],
        confirmed: [],
      },
    ),
  ).toStrictEqual({ kind: 'own', failedCalls: 0 });
});

test('it keeps the head and key of the summary before a fixes-only run that judged no fix', () => {
  expect(
    buildReviewedChange(buildMockReviewResult({ fixesOnly: true, fixChecks: [] }), {
      head: 'b'.repeat(40),
      key: { files: { 'src/scan.ts': '0123456789abcdef' } },
      reviews: 2,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: [],
    }),
  ).toStrictEqual({
    kind: 'kept',
    head: 'b'.repeat(40),
    key: { files: { 'src/scan.ts': '0123456789abcdef' } },
    failedCalls: 0,
  });
});

test('it keeps the failed calls of a lens review that failed through a fixes-only run that judged a fix', () => {
  expect(
    buildReviewedChange(
      buildMockReviewResult({
        fixesOnly: true,
        fixChecks: [
          { findingID: '1111111111111111', fixed: true, reason: 'The separator is a colon now.' },
        ],
      }),
      {
        head: 'b'.repeat(40),
        reviews: 1,
        reported: [],
        failedCalls: 2,
        followUps: [],
        confirmed: [],
      },
    ),
  ).toStrictEqual({ kind: 'kept', head: 'b'.repeat(40), failedCalls: 2 });
});

test('it drops the failed fix call of an earlier fixes-only run after a clean lens review', () => {
  expect(
    buildReviewedChange(buildMockReviewResult({ fixesOnly: true, fixChecks: [] }), {
      head: 'b'.repeat(40),
      reviews: 2,
      reported: [],
      failedCalls: 1,
      followUps: [],
      confirmed: [],
      checked: [],
      lensHead: 'b'.repeat(40),
    }),
  ).toStrictEqual({ kind: 'kept', head: 'b'.repeat(40), failedCalls: 0 });
});

test('it vouches for the merge base alone after a fixes-only run that judged no fix with no summary before it', () => {
  const base = 'a'.repeat(40);

  expect(
    buildReviewedChange(buildMockReviewResult({ base, fixesOnly: true, fixChecks: [] }), null),
  ).toStrictEqual({ kind: 'kept', head: base, failedCalls: 0 });
});
