import { expect, test } from 'bun:test';
import { buildRunComparison } from './build-run-comparison';

test('it measures how far 2 runs on the same cases agree', () => {
  expect(
    buildRunComparison(
      [
        {
          caseID: 'case-1',
          review: {
            findings: [
              {
                lens: null,
                anchor: { path: 'src/a.ts', startLine: 10, endLine: 10 },
                title: 'Keep the row',
                severity: 'P1',
              },
              {
                lens: null,
                anchor: { path: 'src/b.ts', startLine: 4, endLine: 4 },
                title: 'Log the error',
                severity: 'P2',
              },
            ],
            failed: false,
            tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
            durationMs: 0,
            calls: 1,
            depth: null,
          },
        },
      ],
      [
        {
          caseID: 'case-1',
          review: {
            findings: [
              {
                lens: null,
                anchor: { path: 'src/a.ts', startLine: 12, endLine: 12 },
                title: 'Keep the row on failure',
                severity: 'P1',
              },
            ],
            failed: false,
            tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
            durationMs: 0,
            calls: 1,
            depth: null,
          },
        },
      ],
      5,
    ),
  ).toStrictEqual({ cases: 1, findingsFirst: 2, findingsSecond: 1, matched: 1, agreement: 0.5 });
});

test('it leaves out a case that failed in either run', () => {
  expect(
    buildRunComparison(
      [
        {
          caseID: 'case-1',
          review: {
            findings: [],
            failed: true,
            tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
            durationMs: 0,
            calls: 1,
            depth: null,
          },
        },
      ],
      [
        {
          caseID: 'case-1',
          review: {
            findings: [],
            failed: false,
            tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
            durationMs: 0,
            calls: 1,
            depth: null,
          },
        },
      ],
      5,
    ),
  ).toStrictEqual({ cases: 0, findingsFirst: 0, findingsSecond: 0, matched: 0, agreement: 1 });
});
