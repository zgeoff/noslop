import { expect, test } from 'bun:test';
import { buildCheckOutcome } from './build-check-outcome';

test('it passes when every finding holds a valid disposition', () => {
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
    summary: {
      head: 'f'.repeat(40),
      reported: [],
      failedCalls: 0,
      confirmed: ['1111111111111111:abc1234'],
    },
    existingIssues: new Set(['#12']),
    unread: new Set(),
    unreadable: 0,
  });

  expect(outcome).toStrictEqual({
    conclusion: 'success',
    title: 'No open finding (2)',
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
    summary: {
      head: 'f'.repeat(40),
      reported: [],
      failedCalls: 0,
      confirmed: [],
    },
    existingIssues: new Set(['#12']),
    unread: new Set(),
    unreadable: 0,
  });

  expect(outcome).toStrictEqual({
    conclusion: 'failure',
    title: '5 findings are open.',
    summary: [
      '5 findings are open.',
      '- `1111111111111111` Await the write: the change wrote this code, so it takes fixed, not-a-defect or accepted-risk',
      '- `2222222222222222` Check the token: a P1, a security finding or a risk-class finding blocks the merge and cannot be deferred',
      '- `3333333333333333` Keep the jobs: only a repo admin gives accepted-risk',
      '- `4444444444444444` Lock the row: no fix check has confirmed the commit abc1234 yet',
      '- `5555555555555555` Close the file: no disposition',
    ].join('\n'),
    open: [
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
        reason: 'only a repo admin gives accepted-risk',
      },
      {
        id: '4444444444444444',
        title: 'Lock the row',
        reason: 'no fix check has confirmed the commit abc1234 yet',
      },
      { id: '5555555555555555', title: 'Close the file', reason: 'no disposition' },
    ],
  });
});

test('it fails a fixed finding that is still found or that no fix check confirmed', () => {
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
        id: '3333333333333333',
        title: 'Name the retry',
        path: 'src/b.ts',
        lens: 'naming-shape-and-comments',
        severity: 'P3',
        riskClass: null,
        writtenByChange: false,
      },
      {
        id: '4444444444444444',
        title: 'Close the file',
        path: 'src/files.ts',
        lens: 'correctness',
        severity: 'P2',
        riskClass: null,
        writtenByChange: true,
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
        findingID: '4444444444444444',
        kind: 'fixed',
        value: 'abc1234',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:00:40.000Z',
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
      reported: ['1111111111111111'],
      failedCalls: 0,
      confirmed: [],
    },
    existingIssues: new Set(),
    unread: new Set(),
    unreadable: 0,
  });

  expect(outcome.open.map((item) => item.reason)).toStrictEqual([
    'the re-review still finds it',
    'the issue #99 does not exist',
    'no fix check has confirmed the commit abc1234 yet',
  ]);
});

test('it passes a fixed finding whose sha the branch no longer holds once a review confirmed it', () => {
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
        kind: 'fixed',
        value: 'abc1234',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:00:00.000Z',
      },
    ],
    summary: {
      head: 'f'.repeat(40),
      reported: [],
      failedCalls: 0,
      confirmed: ['1111111111111111:abc1234'],
    },
    existingIssues: new Set(),
    unread: new Set(),
    unreadable: 0,
  });

  expect(outcome.open).toStrictEqual([]);
});

test('it fails a fixed finding that the latest review reports but never read the fix of, and names the commit', () => {
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
        kind: 'fixed',
        value: 'abc1234',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:00:00.000Z',
      },
    ],
    summary: {
      head: 'e'.repeat(40),
      reported: ['1111111111111111'],
      failedCalls: 0,
      confirmed: [],
    },
    existingIssues: new Set(),
    unread: new Set(['1111111111111111']),
    unreadable: 0,
  });

  expect(outcome.open).toStrictEqual([
    {
      id: '1111111111111111',
      title: 'Await the write',
      reason: 'no fix check has read the commit abc1234 yet',
    },
  ]);
});

test('it fails a fixed finding that the latest review neither reports nor read the fix of', () => {
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
        kind: 'fixed',
        value: 'abc1234',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:00:00.000Z',
      },
    ],
    summary: {
      head: 'e'.repeat(40),
      reported: [],
      failedCalls: 0,
      confirmed: [],
    },
    existingIssues: new Set(),
    unread: new Set(['1111111111111111']),
    unreadable: 0,
  });

  expect(outcome.conclusion).toBe('failure');

  expect(outcome.open).toStrictEqual([
    {
      id: '1111111111111111',
      title: 'Await the write',
      reason: 'no fix check has read the commit abc1234 yet',
    },
  ]);
});

test('it passes a fixed finding that a fix call confirmed although the latest review head does not hold the commit', () => {
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
        kind: 'fixed',
        value: 'abc1234',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:00:00.000Z',
      },
    ],
    summary: {
      head: 'e'.repeat(40),
      reported: [],
      failedCalls: 0,
      confirmed: ['1111111111111111:abc1234'],
    },
    existingIssues: new Set(),
    unread: new Set(['1111111111111111']),
    unreadable: 0,
  });

  expect(outcome.open).toStrictEqual([]);
});

test('it fails a bare fixed finding that no fix check confirmed and names the fix', () => {
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
        kind: 'fixed',
        value: '',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:00:00.000Z',
      },
    ],
    summary: {
      head: 'f'.repeat(40),
      reported: [],
      failedCalls: 0,
      confirmed: [],
    },
    existingIssues: new Set(),
    unread: new Set(),
    unreadable: 0,
  });

  expect(outcome.open).toStrictEqual([
    {
      id: '1111111111111111',
      title: 'Await the write',
      reason: 'no fix check has confirmed the fix yet',
    },
  ]);
});

test('it fails a fixed finding whose answer a review confirmed only for another finding', () => {
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
        kind: 'fixed',
        value: 'abc1234',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-10-17T10:00:00.000Z',
      },
    ],
    summary: {
      head: 'f'.repeat(40),
      reported: [],
      failedCalls: 0,
      confirmed: ['2222222222222222:abc1234'],
    },
    existingIssues: new Set(),
    unread: new Set(),
    unreadable: 0,
  });

  expect(outcome.open).toStrictEqual([
    {
      id: '1111111111111111',
      title: 'Await the write',
      reason: 'no fix check has confirmed the commit abc1234 yet',
    },
  ]);
});

test('it fails when a finding comment holds a marker noslop cannot read', () => {
  const outcome = buildCheckOutcome({
    findings: [],
    dispositions: [],
    summary: {
      head: 'f'.repeat(40),
      reported: [],
      failedCalls: 0,
      confirmed: [],
    },
    existingIssues: new Set(),
    unread: new Set(),
    unreadable: 2,
  });

  expect(outcome).toStrictEqual({
    conclusion: 'failure',
    title: '2 finding comments hold a marker noslop cannot read.',
    summary: '2 finding comments hold a marker noslop cannot read.',
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
    summary: {
      head: 'f'.repeat(40),
      reported: [],
      failedCalls: 0,
      confirmed: [],
    },
    existingIssues: new Set(),
    unread: new Set(),
    unreadable: 0,
  });

  expect(outcome.conclusion).toBe('success');
});

test('it passes with no open finding though the last review read another head and a call failed', () => {
  const outcome = buildCheckOutcome({
    findings: [],
    dispositions: [],
    summary: {
      head: 'e'.repeat(40),
      key: { files: { 'src/a.ts': '0123456789abcdef' } },
      reported: [],
      failedCalls: 2,
      confirmed: [],
    },
    existingIssues: new Set(),
    unread: new Set(),
    unreadable: 0,
  });

  expect(outcome).toStrictEqual({
    conclusion: 'success',
    title: 'No open finding (0)',
    summary: '',
    open: [],
  });
});
