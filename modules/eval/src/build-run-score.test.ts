import { expect, test } from 'bun:test';
import { buildRunScore } from './build-run-score';

test('it scores the labelled findings a run repeats, per lens', () => {
  const score = buildRunScore(
    [
      {
        id: 'case-1',
        repo: '/repos/app',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'feat: add the queue',
        body: '',
        findings: [
          {
            anchor: { path: 'src/queue.ts', startLine: 10, endLine: 10 },
            title: 'Keep the row',
            severity: 'P1',
            lens: 'correctness',
            label: 'true-positive',
          },
          {
            anchor: { path: 'src/auth.ts', startLine: 3, endLine: 3 },
            title: 'Check the actor',
            severity: 'P1',
            lens: 'security',
            label: 'true-positive',
          },
          {
            anchor: { path: 'src/log.ts', startLine: 40, endLine: 40 },
            title: 'Log the error',
            severity: 'P2',
            lens: 'failure-handling-and-observability',
            label: 'false-positive',
          },
        ],
        escapes: [
          {
            defect: 'The retry reruns a write',
            anchor: { path: 'src/retry.ts', startLine: 7, endLine: 7 },
            lens: 'concurrency-and-data-integrity',
            visibleInDiff: true,
          },
        ],
      },
    ],
    [
      {
        caseID: 'case-1',
        review: {
          findings: [
            {
              lens: 'correctness',
              anchor: { path: 'src/queue.ts', startLine: 11, endLine: 11 },
              title: 'Keep the row',
              severity: 'P1',
            },
            {
              lens: 'correctness',
              anchor: { path: 'src/log.ts', startLine: 40, endLine: 40 },
              title: 'Log the error',
              severity: 'P2',
            },
            {
              lens: 'correctness',
              anchor: { path: 'src/retry.ts', startLine: 8, endLine: 8 },
              title: 'Make the retry idempotent',
              severity: 'P1',
            },
          ],
          failed: false,
          tokens: { input: 100, cachedInput: 900, cacheWrite: 30, output: 20 },
          durationMs: 3000,
          calls: 2,
          depth: 'standard',
        },
      },
    ],
    5,
  );

  expect(score).toStrictEqual({
    cases: 1,
    failedCases: 0,
    lenses: [
      {
        lens: 'correctness',
        baselineTruePositives: 1,
        repeatedTruePositives: 1,
        reported: 3,
        matchedTruePositive: 1,
        matchedFalsePositive: 1,
        matchedDisputed: 0,
        unlabelled: 1,
        escapesCaught: 1,
      },
      {
        lens: 'security',
        baselineTruePositives: 1,
        repeatedTruePositives: 0,
        reported: 0,
        matchedTruePositive: 0,
        matchedFalsePositive: 0,
        matchedDisputed: 0,
        unlabelled: 0,
        escapesCaught: 0,
      },
    ],
    baselineTruePositives: 2,
    repeatedTruePositives: 1,
    reported: 3,
    unlabelled: 1,
    escapesCaught: 1,
    escapesWithAnchor: 1,
    lightCases: 0,
    lightP1s: 0,
    lightEscapes: 0,
    tokens: { input: 100, cachedInput: 900, cacheWrite: 30, output: 20 },
    durationMs: 3000,
    calls: 2,
  });
});

test('it counts the P1s and escapes on cases the run reviewed at Light', () => {
  const score = buildRunScore(
    [
      {
        id: 'case-1',
        repo: '/repos/app',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'fix: tidy a test',
        body: '',
        findings: [
          {
            anchor: { path: 'src/queue.ts', startLine: 10, endLine: 10 },
            title: 'Keep the row',
            severity: 'P1',
            lens: 'correctness',
            label: 'true-positive',
          },
        ],
        escapes: [{ defect: 'The retry reruns a write', visibleInDiff: false }],
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
          depth: 'light',
        },
      },
    ],
    5,
  );

  expect([score.lightCases, score.lightP1s, score.lightEscapes]).toStrictEqual([1, 1, 1]);
});
