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
        silences: 0,
        silencesBroken: 0,
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
        silences: 0,
        silencesBroken: 0,
      },
    ],
    baselineTruePositives: 2,
    repeatedTruePositives: 1,
    reported: 3,
    unlabelled: 1,
    escapesCaught: 1,
    escapesWithAnchor: 1,
    silences: 0,
    silencesBroken: 0,
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

test('it scores a silence with no anchor as broken when its lens reports anywhere in the change', () => {
  const score = buildRunScore(
    [
      {
        id: 'case-1',
        repo: '/repos/app',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'feat: drain the queue',
        body: 'Touches src/queue.ts and README.md.',
        findings: [],
        escapes: [],
        silences: [{ lens: 'intent', reason: 'The body names files an earlier push changed' }],
      },
    ],
    [
      {
        caseID: 'case-1',
        review: {
          findings: [
            {
              lens: 'intent',
              anchor: { path: 'src/queue.ts', startLine: 30, endLine: 30 },
              title: 'The body names README.md, which the change leaves alone',
              severity: 'P3',
            },
          ],
          failed: false,
          tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
          durationMs: 0,
          calls: 1,
          depth: 'standard',
        },
      },
    ],
    5,
  );

  expect(score.lenses).toStrictEqual([
    {
      lens: 'intent',
      baselineTruePositives: 0,
      repeatedTruePositives: 0,
      reported: 1,
      matchedTruePositive: 0,
      matchedFalsePositive: 0,
      matchedDisputed: 0,
      unlabelled: 1,
      escapesCaught: 0,
      silences: 1,
      silencesBroken: 1,
    },
  ]);

  expect(score.silences).toBe(1);
  expect(score.silencesBroken).toBe(1);
});

test('it counts a silence broken by several findings once', () => {
  const score = buildRunScore(
    [
      {
        id: 'case-1',
        repo: '/repos/app',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'feat: drain the queue',
        body: 'Touches src/queue.ts, src/worker.ts and README.md.',
        findings: [],
        escapes: [],
        silences: [{ lens: 'intent', reason: 'The body names files an earlier push changed' }],
      },
    ],
    [
      {
        caseID: 'case-1',
        review: {
          findings: [
            {
              lens: 'intent',
              anchor: { path: 'src/queue.ts', startLine: 30, endLine: 30 },
              title: 'The body names README.md, which the change leaves alone',
              severity: 'P3',
            },
            {
              lens: 'intent',
              anchor: { path: 'src/queue.ts', startLine: 31, endLine: 31 },
              title: 'The body names src/worker.ts, which the change leaves alone',
              severity: 'P3',
            },
          ],
          failed: false,
          tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
          durationMs: 0,
          calls: 1,
          depth: 'standard',
        },
      },
    ],
    5,
  );

  expect(score.lenses).toStrictEqual([
    {
      lens: 'intent',
      baselineTruePositives: 0,
      repeatedTruePositives: 0,
      reported: 2,
      matchedTruePositive: 0,
      matchedFalsePositive: 0,
      matchedDisputed: 0,
      unlabelled: 2,
      escapesCaught: 0,
      silences: 1,
      silencesBroken: 1,
    },
  ]);

  expect(score.silences).toBe(1);
  expect(score.silencesBroken).toBe(1);
});

test('it scores a silence with no anchor as kept when its lens reports nothing', () => {
  const score = buildRunScore(
    [
      {
        id: 'case-1',
        repo: '/repos/app',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'feat: drain the queue',
        body: 'Touches src/queue.ts and README.md.',
        findings: [],
        escapes: [],
        silences: [{ lens: 'intent', reason: 'The body names files an earlier push changed' }],
      },
    ],
    [
      {
        caseID: 'case-1',
        review: {
          findings: [
            {
              lens: 'correctness',
              anchor: { path: 'src/queue.ts', startLine: 30, endLine: 30 },
              title: 'Drain the queue before close',
              severity: 'P2',
            },
          ],
          failed: false,
          tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
          durationMs: 0,
          calls: 1,
          depth: 'standard',
        },
      },
    ],
    5,
  );

  expect(score.lenses).toPartiallyContain({ lens: 'intent', silences: 1, silencesBroken: 0 });
  expect(score.silences).toBe(1);
  expect(score.silencesBroken).toBe(0);
});

test('it scores an anchored silence as broken when its lens reports within the window of the anchor', () => {
  const score = buildRunScore(
    [
      {
        id: 'case-1',
        repo: '/repos/app',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'feat: drain the queue',
        body: '',
        findings: [],
        escapes: [],
        silences: [
          {
            lens: 'naming-shape-and-comments',
            anchor: { path: 'src/queue.ts', startLine: 10, endLine: 12 },
            reason: 'The name follows the queue library',
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
              lens: 'naming-shape-and-comments',
              anchor: { path: './src/queue.ts', startLine: 15, endLine: 15 },
              title: 'Rename the drain flag',
              severity: 'P3',
            },
          ],
          failed: false,
          tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
          durationMs: 0,
          calls: 1,
          depth: 'standard',
        },
      },
    ],
    5,
  );

  expect(score.silences).toBe(1);
  expect(score.silencesBroken).toBe(1);
});

test('it scores an anchored silence as kept when its lens reports only off the anchor and another lens reports on it', () => {
  const score = buildRunScore(
    [
      {
        id: 'case-1',
        repo: '/repos/app',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'feat: drain the queue',
        body: '',
        findings: [],
        escapes: [],
        silences: [
          {
            lens: 'naming-shape-and-comments',
            anchor: { path: 'src/queue.ts', startLine: 10, endLine: 12 },
            reason: 'The name follows the queue library',
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
              lens: 'naming-shape-and-comments',
              anchor: { path: 'src/queue.ts', startLine: 40, endLine: 40 },
              title: 'Rename the retry flag',
              severity: 'P3',
            },
            {
              lens: 'naming-shape-and-comments',
              anchor: { path: 'src/worker.ts', startLine: 11, endLine: 11 },
              title: 'Rename the worker flag',
              severity: 'P3',
            },
            {
              lens: 'correctness',
              anchor: { path: 'src/queue.ts', startLine: 11, endLine: 11 },
              title: 'Drain the queue before close',
              severity: 'P2',
            },
          ],
          failed: false,
          tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
          durationMs: 0,
          calls: 1,
          depth: 'standard',
        },
      },
    ],
    5,
  );

  expect(score.silences).toBe(1);
  expect(score.silencesBroken).toBe(0);
});

test('it leaves a silence unscored when a call that carried its lens failed', () => {
  const score = buildRunScore(
    [
      {
        id: 'case-1',
        repo: '/repos/app',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'feat: drain the queue',
        body: '',
        findings: [],
        escapes: [],
        silences: [
          { lens: 'intent', reason: 'The body names files an earlier push changed' },
          { lens: 'correctness', reason: 'The drain order is the one the issue asks for' },
        ],
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
          calls: 2,
          depth: 'standard',
          failedLenses: ['intent'],
        },
      },
    ],
    5,
  );

  expect(score.lenses).toStrictEqual([
    {
      lens: 'correctness',
      baselineTruePositives: 0,
      repeatedTruePositives: 0,
      reported: 0,
      matchedTruePositive: 0,
      matchedFalsePositive: 0,
      matchedDisputed: 0,
      unlabelled: 0,
      escapesCaught: 0,
      silences: 1,
      silencesBroken: 0,
    },
  ]);

  expect(score.silences).toBe(1);
  expect(score.silencesBroken).toBe(0);
});

test('it leaves the silences of a failed case unscored', () => {
  const score = buildRunScore(
    [
      {
        id: 'case-1',
        repo: '/repos/app',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'feat: drain the queue',
        body: '',
        findings: [],
        escapes: [],
        silences: [{ lens: 'intent', reason: 'The body names files an earlier push changed' }],
      },
    ],
    [
      {
        caseID: 'case-1',
        review: {
          findings: [],
          failed: true,
          tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
          durationMs: 0,
          calls: 1,
          depth: 'standard',
        },
      },
    ],
    5,
  );

  expect(score.lenses).toStrictEqual([]);
  expect(score.silences).toBe(0);
  expect(score.silencesBroken).toBe(0);
});
