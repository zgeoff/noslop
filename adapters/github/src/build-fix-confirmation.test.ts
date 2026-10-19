import { expect, test } from 'bun:test';
import { buildFixConfirmation } from './build-fix-confirmation';

test('it confirms a fix the review read in its range and did not report again', () => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: 'abc1234',
      match: 'abc1234'.padEnd(40, '0'),
      isInRange: true,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'silent',
      isReported: false,
    }),
  ).toStrictEqual({
    id: '1111111111111111',
    title: 'Await the write',
    commit: 'abc1234',
    fixed: true,
  });
});

test.each([
  ['the review reported the finding again', { isReported: true }],
  ['the sha names no single commit', { match: null }],
  ['the commit is outside the range', { isInRange: false }],
  ['the review left the finding file out', { isFileSkipped: true }],
  ['a call of the review failed', { isPartial: true }],
  [
    'the commit reaches a file the review left out',
    { coverage: { changesSkipped: true, failure: null } },
  ],
])('it confirms no fix when %s', (_label, change) => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: 'abc1234',
      match: 'abc1234'.padEnd(40, '0'),
      isInRange: true,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'silent',
      isReported: false,
      ...change,
    }).fixed,
  ).toBe(false);
});

test('it keeps a fix an earlier review confirmed outside the range of this one', () => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: 'abc1234',
      match: 'abc1234'.padEnd(40, '0'),
      isInRange: false,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'confirmed',
      isReported: false,
    }).fixed,
  ).toBe(true);
});

test.each([
  ['a rejected', 'rejected'],
  ['a silent', 'silent'],
] as const)('it confirms no fix outside the range of this review for %s answer', (_label, held) => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: 'abc1234',
      match: 'abc1234'.padEnd(40, '0'),
      isInRange: false,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held,
      isReported: false,
    }).fixed,
  ).toBe(false);
});

test('it rejects a fix an earlier review confirmed once this review reports the finding again', () => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: 'abc1234',
      match: 'abc1234'.padEnd(40, '0'),
      isInRange: false,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'retained',
      isReported: true,
    }).fixed,
  ).toBe(false);
});

test('it names why GitHub could not show an unconfirmed fix whole', () => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: 'abc1234',
      match: 'abc1234'.padEnd(40, '0'),
      isInRange: true,
      isFileSkipped: false,
      isPartial: false,
      coverage: {
        changesSkipped: true,
        failure: 'the fix commit changes more files than GitHub lists',
      },
      held: 'silent',
      isReported: false,
    }),
  ).toStrictEqual({
    id: '1111111111111111',
    title: 'Await the write',
    commit: 'abc1234',
    fixed: false,
    failure: 'the fix commit changes more files than GitHub lists',
  });
});
