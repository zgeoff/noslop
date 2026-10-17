import { expect, test } from 'bun:test';
import { buildCheckOutcome } from './build-check-outcome';

test('it passes when the review ran on the head and every finding holds a valid disposition', () => {
  const outcome = buildCheckOutcome({
    findings: [
      {
        id: '1111111111111111',
        title: 'Await the write',
        path: 'src/a.ts',
        lens: 'correctness',
        severity: 'P2',
        riskClass: null,
        writtenByChange: true,
      },
      {
        id: '2222222222222222',
        title: 'Name the retry',
        path: 'src/b.ts',
        lens: 'naming-shape-and-comments',
        severity: 'P3',
        riskClass: null,
        writtenByChange: false,
      },
    ],
    dispositions: [
      {
        findingID: '1111111111111111',
        kind: 'fixed',
        value: 'abc1234',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:00:00.000Z',
      },
      {
        findingID: '2222222222222222',
        kind: 'deferred',
        value: '#12',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:01:00.000Z',
      },
    ],
    summary: { head: 'f'.repeat(40), reviews: 2, reported: [], failedCalls: 0, followUps: [] },
    currentHead: 'f'.repeat(40),
    commits: ['abc1234'.padEnd(40, '0'), 'f'.repeat(40)],
    existingIssues: new Set(['#12']),
    fixChangesFile: new Set(['1111111111111111']),
    failedReporters: [],
  });

  expect(outcome).toStrictEqual({
    conclusion: 'success',
    title: 'Every finding holds a valid disposition (2)',
    summary: '',
    open: [],
  });
});

test('it lists each finding whose disposition is not valid, with the reason', () => {
  const outcome = buildCheckOutcome({
    findings: [
      {
        id: '1111111111111111',
        title: 'Await the write',
        path: 'src/a.ts',
        lens: 'correctness',
        severity: 'P2',
        riskClass: null,
        writtenByChange: true,
      },
      {
        id: '2222222222222222',
        title: 'Check the token',
        path: 'src/auth.ts',
        lens: 'security',
        severity: 'P2',
        riskClass: null,
        writtenByChange: false,
      },
      {
        id: '3333333333333333',
        title: 'Keep the jobs',
        path: 'src/jobs.ts',
        lens: 'correctness',
        severity: 'P1',
        riskClass: null,
        writtenByChange: true,
      },
      {
        id: '4444444444444444',
        title: 'Lock the row',
        path: 'src/rows.ts',
        lens: 'correctness',
        severity: 'P2',
        riskClass: null,
        writtenByChange: true,
      },
      {
        id: '5555555555555555',
        title: 'Close the file',
        path: 'src/files.ts',
        lens: 'correctness',
        severity: 'P3',
        riskClass: null,
        writtenByChange: true,
      },
    ],
    dispositions: [
      {
        findingID: '1111111111111111',
        kind: 'deferred',
        value: '#12',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:00:00.000Z',
      },
      {
        findingID: '2222222222222222',
        kind: 'deferred',
        value: '#12',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:01:00.000Z',
      },
      {
        findingID: '3333333333333333',
        kind: 'accepted-risk',
        value: 'one tenant',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:02:00.000Z',
      },
      {
        findingID: '4444444444444444',
        kind: 'fixed',
        value: 'abc1234',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:03:00.000Z',
      },
    ],
    summary: { head: 'f'.repeat(40), reviews: 2, reported: [], failedCalls: 0, followUps: [] },
    currentHead: 'f'.repeat(40),
    commits: ['f'.repeat(40)],
    existingIssues: new Set(['#12']),
    fixChangesFile: new Set(),
    failedReporters: [],
  });

  expect(outcome.open).toStrictEqual([
    {
      id: '1111111111111111',
      title: 'Await the write',
      reason: 'the change wrote this code, so it takes fixed, not-a-defect or accepted-risk',
    },
    {
      id: '2222222222222222',
      title: 'Check the token',
      reason:
        'a P1, a security finding or a risk-class finding blocks the merge and cannot be deferred',
    },
    {
      id: '3333333333333333',
      title: 'Keep the jobs',
      reason: 'only a repo owner gives accepted-risk',
    },
    {
      id: '4444444444444444',
      title: 'Lock the row',
      reason: 'the commit abc1234 is not on the branch',
    },
    { id: '5555555555555555', title: 'Close the file', reason: 'no disposition' },
  ]);
});

test('it fails a fixed finding that the re-review still finds or whose commit misses its file', () => {
  const outcome = buildCheckOutcome({
    findings: [
      {
        id: '1111111111111111',
        title: 'Await the write',
        path: 'src/a.ts',
        lens: 'correctness',
        severity: 'P2',
        riskClass: null,
        writtenByChange: true,
      },
      {
        id: '2222222222222222',
        title: 'Lock the row',
        path: 'src/rows.ts',
        lens: 'correctness',
        severity: 'P2',
        riskClass: null,
        writtenByChange: true,
      },
      {
        id: '3333333333333333',
        title: 'Name the retry',
        path: 'src/b.ts',
        lens: 'naming-shape-and-comments',
        severity: 'P3',
        riskClass: null,
        writtenByChange: false,
      },
    ],
    dispositions: [
      {
        findingID: '1111111111111111',
        kind: 'fixed',
        value: 'abc1234',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:00:00.000Z',
      },
      {
        findingID: '2222222222222222',
        kind: 'fixed',
        value: 'abc1234',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:00:30.000Z',
      },
      {
        findingID: '3333333333333333',
        kind: 'deferred',
        value: '#99',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:01:00.000Z',
      },
    ],
    summary: {
      head: 'f'.repeat(40),
      reviews: 2,
      reported: ['1111111111111111'],
      failedCalls: 0,
      followUps: [],
    },
    currentHead: 'f'.repeat(40),
    commits: ['abc1234'.padEnd(40, '0'), 'f'.repeat(40)],
    existingIssues: new Set(),
    fixChangesFile: new Set(['1111111111111111']),
    failedReporters: [],
  });

  expect(outcome.open.map((item) => item.reason)).toStrictEqual([
    'the re-review still finds it',
    'the commit abc1234 does not change src/rows.ts',
    'the issue #99 does not exist',
  ]);
});

test('it fails when no review ran on the current head, a call failed or a reporter failed', () => {
  const outcome = buildCheckOutcome({
    findings: [],
    dispositions: [],
    summary: { head: 'e'.repeat(40), reviews: 1, reported: [], failedCalls: 2, followUps: [] },
    currentHead: 'f'.repeat(40),
    commits: [],
    existingIssues: new Set(),
    fixChangesFile: new Set(),
    failedReporters: ['sqlite'],
  });

  expect(outcome).toStrictEqual({
    conclusion: 'failure',
    title: 'No review ran on the current head ffffffffffff.',
    summary: [
      'No review ran on the current head ffffffffffff.',
      '2 calls of the review failed.',
      'These reporters failed: sqlite.',
    ].join('\n'),
    open: [],
  });
});

test('it judges a finding by its latest disposition', () => {
  const outcome = buildCheckOutcome({
    findings: [
      {
        id: '1111111111111111',
        title: 'Await the write',
        path: 'src/a.ts',
        lens: 'correctness',
        severity: 'P2',
        riskClass: null,
        writtenByChange: true,
      },
    ],
    dispositions: [
      {
        findingID: '1111111111111111',
        kind: 'deferred',
        value: '#12',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:00:00.000Z',
      },
      {
        findingID: '1111111111111111',
        kind: 'not-a-defect',
        value: 'the caller awaits it',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T11:00:00.000Z',
      },
    ],
    summary: { head: 'f'.repeat(40), reviews: 1, reported: [], failedCalls: 0, followUps: [] },
    currentHead: 'f'.repeat(40),
    commits: ['f'.repeat(40)],
    existingIssues: new Set(),
    fixChangesFile: new Set(),
    failedReporters: [],
  });

  expect(outcome.conclusion).toBe('success');
});
