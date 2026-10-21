import { expect, test } from 'bun:test';
import { buildFixConfirmation } from './build-fix-confirmation';

test('it confirms a fix the review read in its range and did not report again', () => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: 'abc1234',
      match: 'abc1234'.padEnd(40, '0'),
      isNamed: true,
      isInRange: true,
      isJudged: false,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'silent',
      isReported: false,
      files: { changesPullRequest: true, changesFindingFile: true },
    }),
  ).toStrictEqual({
    id: '1111111111111111',
    title: 'Await the write',
    commit: 'abc1234',
    fixed: true,
    changesFindingFile: true,
  });
});

test('it confirms a fix whose commit changes only another file of the pull request and says so', () => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: 'abc1234',
      match: 'abc1234'.padEnd(40, '0'),
      isNamed: true,
      isInRange: true,
      isJudged: false,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'silent',
      isReported: false,
      files: { changesPullRequest: true, changesFindingFile: false },
    }),
  ).toStrictEqual({
    id: '1111111111111111',
    title: 'Await the write',
    commit: 'abc1234',
    fixed: true,
    changesFindingFile: false,
  });
});

test('it confirms no fix whose commit changes no file of the pull request and says why', () => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: 'abc1234',
      match: 'abc1234'.padEnd(40, '0'),
      isNamed: true,
      isInRange: true,
      isJudged: false,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'silent',
      isReported: false,
      files: { changesPullRequest: false, changesFindingFile: false },
    }),
  ).toStrictEqual({
    id: '1111111111111111',
    title: 'Await the write',
    commit: 'abc1234',
    fixed: false,
    failure: 'the commit changes no file of the pull request',
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
  ['GitHub listed no whole file list of the commit', { files: null }],
])('it confirms no fix when %s', (_label, change) => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: 'abc1234',
      match: 'abc1234'.padEnd(40, '0'),
      isNamed: true,
      isInRange: true,
      isJudged: false,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'silent',
      isReported: false,
      files: { changesPullRequest: true, changesFindingFile: true },
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
      isNamed: true,
      isInRange: false,
      isJudged: false,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'confirmed',
      isReported: false,
      files: { changesPullRequest: true, changesFindingFile: true },
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
      isNamed: true,
      isInRange: false,
      isJudged: false,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held,
      isReported: false,
      files: { changesPullRequest: true, changesFindingFile: true },
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
      isNamed: true,
      isInRange: false,
      isJudged: false,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'retained',
      isReported: true,
      files: { changesPullRequest: true, changesFindingFile: true },
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
      isNamed: true,
      isInRange: true,
      isJudged: false,
      isFileSkipped: false,
      isPartial: false,
      coverage: {
        changesSkipped: true,
        failure: 'the fix commit changes more files than GitHub lists',
      },
      held: 'silent',
      isReported: false,
      files: { changesPullRequest: true, changesFindingFile: true },
    }),
  ).toStrictEqual({
    id: '1111111111111111',
    title: 'Await the write',
    commit: 'abc1234',
    fixed: false,
    failure: 'the fix commit changes more files than GitHub lists',
  });
});

test('it confirms a fix that a fix call judged fixed at the head, whose sha names no commit of the branch', () => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: 'abc1234',
      match: null,
      isNamed: false,
      isInRange: false,
      isJudged: true,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'silent',
      isReported: false,
      files: null,
    }),
  ).toStrictEqual({
    id: '1111111111111111',
    title: 'Await the write',
    commit: 'abc1234',
    fixed: true,
  });
});

test('it confirms a bare fixed answer that a fix call judged fixed at the head', () => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: '',
      match: null,
      isNamed: false,
      isInRange: false,
      isJudged: true,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'silent',
      isReported: false,
      files: null,
    }),
  ).toStrictEqual({
    id: '1111111111111111',
    title: 'Await the write',
    commit: '',
    fixed: true,
  });
});

test('it keeps a bare fixed answer that an earlier fix call confirmed when this review does not judge it', () => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: '',
      match: null,
      isNamed: false,
      isInRange: false,
      isJudged: false,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'confirmed',
      isReported: false,
      files: null,
    }),
  ).toStrictEqual({
    id: '1111111111111111',
    title: 'Await the write',
    commit: '',
    fixed: true,
  });
});

test('it keeps an earlier confirmed fix whose hinted commit changes no file of the pull request when this review does not judge it', () => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: 'abc1234',
      match: 'abc1234'.padEnd(40, '0'),
      isNamed: true,
      isInRange: false,
      isJudged: false,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'confirmed',
      isReported: false,
      files: { changesPullRequest: false, changesFindingFile: false },
    }),
  ).toStrictEqual({
    id: '1111111111111111',
    title: 'Await the write',
    commit: 'abc1234',
    fixed: true,
    changesFindingFile: false,
  });
});

test('it drops an earlier confirmed fix whose sha names 2 commits of the branch', () => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: 'abc1234',
      match: null,
      isNamed: true,
      isInRange: false,
      isJudged: false,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'confirmed',
      isReported: false,
      files: null,
    }).fixed,
  ).toBe(false);
});

test('it rejects a fix that a fix call judged fixed once the review reports the finding again', () => {
  expect(
    buildFixConfirmation({
      id: '1111111111111111',
      title: 'Await the write',
      commit: '',
      match: null,
      isNamed: false,
      isInRange: false,
      isJudged: true,
      isFileSkipped: false,
      isPartial: false,
      coverage: { changesSkipped: false, failure: null },
      held: 'silent',
      isReported: true,
      files: null,
    }).fixed,
  ).toBe(false);
});
