import { expect, test } from 'bun:test';
import { buildMockReviewResult } from '@noslop/testing';
import { findFixCheckFailure } from './find-fix-check-failure';

test("it gives the reason of a fixes-only run's not-fixed verdict", () => {
  expect(
    findFixCheckFailure(
      buildMockReviewResult({
        fixChecks: [
          { findingID: '1111111111111111', fixed: false, reason: 'The guard is still missing.' },
        ],
      }),
      { id: '1111111111111111', title: 'Guard the total', commit: 'abcdef0', fixed: false },
      'src/a.ts',
    ),
  ).toBe('The guard is still missing.');
});

test('it says a fixes-only run read no call of a fix whose file passes the file limit', () => {
  expect(
    findFixCheckFailure(
      buildMockReviewResult({
        fixChecks: [],
        notReviewed: [{ path: 'src/a.ts', reason: 'too-large' }],
      }),
      { id: '1111111111111111', title: 'Guard the total', commit: 'abcdef0', fixed: false },
      'src/a.ts',
    ),
  ).toBe('unjudged: its diff passes the file limit, so no call read it whole');
});

test('it gives no reason for a fix whose file another review left out', () => {
  expect(
    findFixCheckFailure(
      buildMockReviewResult({ notReviewed: [{ path: 'src/a.ts', reason: 'too-large' }] }),
      { id: '1111111111111111', title: 'Guard the total', commit: 'abcdef0', fixed: false },
      'src/a.ts',
    ),
  ).toBeNull();
});

test('it gives no reason for a fix that a fixes-only run left unjudged with its file read', () => {
  expect(
    findFixCheckFailure(
      buildMockReviewResult({
        fixChecks: [],
        notReviewed: [{ path: 'src/b.ts', reason: 'too-large' }],
      }),
      { id: '1111111111111111', title: 'Guard the total', commit: 'abcdef0', fixed: false },
      'src/a.ts',
    ),
  ).toBeNull();
});

test('it gives no reason for a confirmed fix', () => {
  expect(
    findFixCheckFailure(
      buildMockReviewResult({
        fixChecks: [{ findingID: '1111111111111111', fixed: true, reason: 'The guard is in.' }],
      }),
      { id: '1111111111111111', title: 'Guard the total', commit: 'abcdef0', fixed: true },
      'src/a.ts',
    ),
  ).toBeNull();
});
