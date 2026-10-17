import { expect, test } from 'bun:test';
import { requireCasePaths } from './require-case-paths';

test('it accepts a case whose labelled paths each name a file at the head', () => {
  expect(() => {
    requireCasePaths(
      {
        id: 'case-a',
        repo: 'repo',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'Change the lanes',
        body: '',
        findings: [
          {
            anchor: { path: 'src/lanes.ts', startLine: 4, endLine: 4 },
            title: 'Keep the lane order',
            severity: 'P2',
            lens: 'correctness',
            label: 'true-positive',
          },
        ],
        escapes: [
          {
            defect: 'The lanes skip the last one',
            anchor: { path: 'src/lanes.ts', startLine: 7, endLine: 7 },
            visibleInDiff: true,
          },
          { defect: 'The picker leaks', visibleInDiff: false },
        ],
      },
      ['src/lanes.ts', 'src/main.ts'],
    );
  }).not.toThrow();
});

test('it rejects a case that labels a path naming no file at the head', () => {
  expect(() => {
    requireCasePaths(
      {
        id: 'case-a',
        repo: 'repo',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'Change the lanes',
        body: '',
        findings: [
          {
            anchor: { path: 'checkout/src/lanes.ts', startLine: 4, endLine: 4 },
            title: 'Keep the lane order',
            severity: 'P2',
            lens: 'correctness',
            label: 'true-positive',
          },
        ],
        escapes: [
          {
            defect: 'The picker leaks',
            anchor: { path: 'client/picker.ts', startLine: 2, endLine: 2 },
            visibleInDiff: true,
          },
        ],
      },
      ['src/lanes.ts', 'src/client/picker.ts'],
    );
  }).toThrowWithMessage(
    Error,
    'case case-a labels paths that name no file at its head: checkout/src/lanes.ts, client/picker.ts',
  );
});

test('it leaves a case whose head files could not be read to the replay', () => {
  expect(() => {
    requireCasePaths(
      {
        id: 'case-a',
        repo: 'repo',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'Change the lanes',
        body: '',
        findings: [
          {
            anchor: { path: 'src/lanes.ts', startLine: 4, endLine: 4 },
            title: 'Keep the lane order',
            severity: 'P2',
            lens: 'correctness',
            label: 'true-positive',
          },
        ],
        escapes: [],
      },
      [],
    );
  }).not.toThrow();
});
