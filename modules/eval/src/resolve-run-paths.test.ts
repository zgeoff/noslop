import { expect, test } from 'bun:test';
import { resolveRunPaths } from './resolve-run-paths';

test('it resolves each reported path to its file at the head of its case', () => {
  const resolved = resolveRunPaths(
    [
      {
        caseID: 'case-a',
        review: {
          findings: [
            {
              lens: 'correctness',
              title: 'Close the picker',
              severity: 'P2',
              anchor: { path: 'client/picker.ts', startLine: 9, endLine: 9 },
            },
          ],
          failed: false,
          tokens: { input: 0, output: 0 },
          durationMs: 0,
          calls: 1,
          depth: null,
        },
      },
      {
        caseID: 'case-b',
        review: {
          findings: [
            {
              lens: null,
              title: 'Keep the lane order',
              severity: 'P3',
              anchor: { path: 'checkout/src/lanes.ts', startLine: 4, endLine: 4 },
            },
          ],
          failed: false,
          tokens: { input: 0, output: 0 },
          durationMs: 0,
          calls: 1,
          depth: null,
        },
      },
    ],
    new Map([['case-a', ['src/client/picker.ts']]]),
  );

  expect(resolved).toStrictEqual([
    {
      caseID: 'case-a',
      review: {
        findings: [
          {
            lens: 'correctness',
            title: 'Close the picker',
            severity: 'P2',
            anchor: { path: 'src/client/picker.ts', startLine: 9, endLine: 9 },
          },
        ],
        failed: false,
        tokens: { input: 0, output: 0 },
        durationMs: 0,
        calls: 1,
        depth: null,
      },
    },
    {
      caseID: 'case-b',
      review: {
        findings: [
          {
            lens: null,
            title: 'Keep the lane order',
            severity: 'P3',
            anchor: { path: 'checkout/src/lanes.ts', startLine: 4, endLine: 4 },
          },
        ],
        failed: false,
        tokens: { input: 0, output: 0 },
        durationMs: 0,
        calls: 1,
        depth: null,
      },
    },
  ]);
});
