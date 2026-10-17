import { expect, test } from 'bun:test';
import { buildStaticScore } from './build-static-score';

test('it counts each depth and lists the labelled P1s and escapes that fall at Light', () => {
  const score = buildStaticScore(
    [
      {
        id: 'case-light',
        repo: 'repo',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'Tweak a',
        body: '',
        findings: [
          {
            anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
            title: 'Keep the lock',
            severity: 'P1',
            lens: 'correctness',
            label: 'true-positive',
          },
          {
            anchor: { path: 'src/a.ts', startLine: 2, endLine: 2 },
            title: 'Name the flag',
            severity: 'P3',
            lens: null,
            label: 'true-positive',
          },
        ],
        escapes: [{ defect: 'The flag stays set', visibleInDiff: true }],
      },
      {
        id: 'case-deep',
        repo: 'repo',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'Change auth',
        body: '',
        findings: [
          {
            anchor: { path: 'src/auth.ts', startLine: 1, endLine: 1 },
            title: 'Check the token',
            severity: 'P1',
            lens: 'security',
            label: 'true-positive',
          },
          {
            anchor: { path: 'src/auth.ts', startLine: 4, endLine: 4 },
            title: 'Drop the retry',
            severity: 'P1',
            lens: null,
            label: 'false-positive',
          },
        ],
        escapes: [],
      },
      {
        id: 'case-failed',
        repo: 'repo',
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        title: 'Change b',
        body: '',
        findings: [],
        escapes: [],
      },
    ],
    [
      {
        caseID: 'case-light',
        plan: { depth: 'light', special: null, calls: ['L'], maxCalls: 1 },
      },
      {
        caseID: 'case-deep',
        plan: { depth: 'deep', special: null, calls: ['A', 'B'], maxCalls: 4 },
      },
      { caseID: 'case-failed', plan: null },
    ],
  );

  expect(score).toStrictEqual({
    cases: 3,
    failed: 1,
    depths: {
      light: { cases: 1, labelledP1s: 1, escapes: 1, groupCalls: 1, maxCalls: 1 },
      standard: { cases: 0, labelledP1s: 0, escapes: 0, groupCalls: 0, maxCalls: 0 },
      deep: { cases: 1, labelledP1s: 1, escapes: 0, groupCalls: 2, maxCalls: 4 },
    },
    lightMisses: [
      { caseID: 'case-light', kind: 'p1', text: 'Keep the lock' },
      { caseID: 'case-light', kind: 'escape', text: 'The flag stays set' },
    ],
    perCase: [
      { caseID: 'case-light', depth: 'light', groupCalls: 1, maxCalls: 1 },
      { caseID: 'case-deep', depth: 'deep', groupCalls: 2, maxCalls: 4 },
    ],
  });
});
