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
    summary: {
      head: 'f'.repeat(40),
      reviews: 2,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: ['1111111111111111:abc1234'],
    },
    confirmed: ['1111111111111111:abc1234'],
    fixFailures: new Map(),
    currentHead: 'f'.repeat(40),
    currentKey: { head: 'f'.repeat(40) },
    commits: ['abc1234'.padEnd(40, '0'), 'f'.repeat(40)],
    ambiguous: [],
    rewritten: new Map(),
    existingIssues: new Set(['#12']),
    failedReporters: [],
    unreadable: 0,
  });

  expect(outcome).toStrictEqual({
    conclusion: 'success',
    title: 'Every finding holds a valid disposition (2)',
    summary: '',
    open: [],
    reviewed: true,
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
      reviews: 2,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: [],
    },
    confirmed: [],
    fixFailures: new Map(),
    currentHead: 'f'.repeat(40),
    currentKey: { head: 'f'.repeat(40) },
    commits: ['f'.repeat(40)],
    ambiguous: [],
    rewritten: new Map(),
    existingIssues: new Set(['#12']),
    failedReporters: [],
    unreadable: 0,
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

test('it fails a fixed finding that is still found or that no re-review read', () => {
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
      reviews: 2,
      reported: ['1111111111111111'],
      failedCalls: 0,
      followUps: [],
      confirmed: [],
    },
    confirmed: [],
    fixFailures: new Map(),
    currentHead: 'f'.repeat(40),
    currentKey: { head: 'f'.repeat(40) },
    commits: ['abc1234'.padEnd(40, '0'), 'f'.repeat(40)],
    ambiguous: [],
    rewritten: new Map(),
    existingIssues: new Set(),
    failedReporters: [],
    unreadable: 0,
  });

  expect(outcome.open.map((item) => item.reason)).toStrictEqual([
    'the re-review still finds it',
    'the issue #99 does not exist',
    'no re-review has read the commit abc1234 yet',
  ]);
});

test('it names why GitHub could not show a fixed finding whole', () => {
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
      reviews: 2,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: [],
    },
    confirmed: [],
    fixFailures: new Map([
      ['1111111111111111', 'GitHub could not list the files of the fix commit (HTTP 502)'],
    ]),
    currentHead: 'f'.repeat(40),
    currentKey: { head: 'f'.repeat(40) },
    commits: ['abc1234'.padEnd(40, '0'), 'f'.repeat(40)],
    ambiguous: [],
    rewritten: new Map(),
    existingIssues: new Set(),
    failedReporters: [],
    unreadable: 0,
  });

  expect(outcome.open.map((item) => item.reason)).toStrictEqual([
    'the review could not read the commit abc1234: GitHub could not list the files of the fix commit (HTTP 502)',
  ]);
});

test('it fails a fixed finding whose sha matches 2 commits on the branch', () => {
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
      reviews: 2,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: ['1111111111111111:abc1234'],
    },
    confirmed: ['1111111111111111:abc1234'],
    fixFailures: new Map(),
    currentHead: 'f'.repeat(40),
    currentKey: { head: 'f'.repeat(40) },
    commits: ['abc1234'.padEnd(40, 'a'), 'abc1234'.padEnd(40, 'c'), 'f'.repeat(40)],
    ambiguous: [],
    rewritten: new Map(),
    existingIssues: new Set(),
    failedReporters: [],
    unreadable: 0,
  });

  expect(outcome.open).toStrictEqual([
    {
      id: '1111111111111111',
      title: 'Await the write',
      reason: 'the sha abc1234 matches more than one commit on the branch, so give more of it',
    },
  ]);
});

test('it passes a fixed finding whose sha a rebase rewrote into a commit on the branch', () => {
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
      reviews: 2,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: ['1111111111111111:abc1234'],
    },
    confirmed: ['1111111111111111:abc1234'],
    fixFailures: new Map(),
    currentHead: 'f'.repeat(40),
    currentKey: { head: 'f'.repeat(40) },
    commits: ['d'.repeat(40), 'f'.repeat(40)],
    ambiguous: [],
    rewritten: new Map([['1111111111111111:abc1234', 'd'.repeat(40)]]),
    existingIssues: new Set(),
    failedReporters: [],
    unreadable: 0,
  });

  expect(outcome.open).toStrictEqual([]);
});

test('it fails a fixed finding whose sha a rebase rewrote only for another finding', () => {
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
      reviews: 2,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: ['1111111111111111:abc1234'],
    },
    confirmed: ['1111111111111111:abc1234'],
    fixFailures: new Map(),
    currentHead: 'f'.repeat(40),
    currentKey: { head: 'f'.repeat(40) },
    commits: ['d'.repeat(40), 'f'.repeat(40)],
    ambiguous: [],
    rewritten: new Map([['2222222222222222:abc1234', 'd'.repeat(40)]]),
    existingIssues: new Set(),
    failedReporters: [],
    unreadable: 0,
  });

  expect(outcome.open).toStrictEqual([
    {
      id: '1111111111111111',
      title: 'Await the write',
      reason: 'the commit abc1234 is not on the branch',
    },
  ]);
});

test('it fails when a finding comment holds a marker noslop cannot read', () => {
  const outcome = buildCheckOutcome({
    findings: [],
    dispositions: [],
    summary: {
      head: 'f'.repeat(40),
      reviews: 1,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: [],
    },
    confirmed: [],
    fixFailures: new Map(),
    currentHead: 'f'.repeat(40),
    currentKey: { head: 'f'.repeat(40) },
    commits: ['f'.repeat(40)],
    ambiguous: [],
    rewritten: new Map(),
    existingIssues: new Set(),
    failedReporters: [],
    unreadable: 2,
  });

  expect(outcome).toStrictEqual({
    conclusion: 'failure',
    title: '2 finding comments hold a marker noslop cannot read.',
    summary: '2 finding comments hold a marker noslop cannot read.',
    open: [],
    reviewed: true,
  });
});

test('it fails when no review ran on the current head, a call failed or a reporter failed', () => {
  const outcome = buildCheckOutcome({
    findings: [],
    dispositions: [],
    summary: {
      head: 'e'.repeat(40),
      reviews: 1,
      reported: [],
      failedCalls: 2,
      followUps: [],
      confirmed: [],
    },
    confirmed: [],
    fixFailures: new Map(),
    currentHead: 'f'.repeat(40),
    currentKey: { head: 'f'.repeat(40) },
    commits: [],
    ambiguous: [],
    rewritten: new Map(),
    existingIssues: new Set(),
    failedReporters: ['sqlite'],
    unreadable: 0,
  });

  expect(outcome).toStrictEqual({
    conclusion: 'failure',
    title: 'No noslop review for this commit, ffffffffffff.',
    summary: [
      'No noslop review for this commit, ffffffffffff.',
      '2 calls of the review failed.',
      'These reporters failed: sqlite.',
    ].join('\n'),
    open: [],
    reviewed: false,
  });
});

test('it passes at a new head whose net change holds the same patch id for each file as the review', () => {
  const outcome = buildCheckOutcome({
    findings: [],
    dispositions: [],
    summary: {
      head: 'e'.repeat(40),
      key: { files: { 'src/a.ts': '0123456789abcdef', 'src/b.ts': 'fedcba9876543210' } },
      reviews: 1,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: [],
    },
    confirmed: [],
    fixFailures: new Map(),
    currentHead: 'f'.repeat(40),
    currentKey: { files: { 'src/a.ts': '0123456789abcdef', 'src/b.ts': 'fedcba9876543210' } },
    commits: ['f'.repeat(40)],
    ambiguous: [],
    rewritten: new Map(),
    existingIssues: new Set(),
    failedReporters: [],
    unreadable: 0,
  });

  expect(outcome).toStrictEqual({
    conclusion: 'success',
    title: 'Every finding holds a valid disposition (0)',
    summary: '',
    open: [],
    reviewed: true,
  });
});

test('it fails at a new head and names each file whose patch id changed, came or went since the review', () => {
  const outcome = buildCheckOutcome({
    findings: [],
    dispositions: [],
    summary: {
      head: 'e'.repeat(40),
      key: {
        files: {
          'src/a.ts': '0123456789abcdef',
          'src/b.ts': 'fedcba9876543210',
          'src/c.ts': '1111111111111111',
        },
      },
      reviews: 1,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: [],
    },
    confirmed: [],
    fixFailures: new Map(),
    currentHead: 'f'.repeat(40),
    currentKey: {
      files: {
        'src/a.ts': '0123456789abcdef',
        'src/b.ts': '2222222222222222',
        'src/d.ts': '3333333333333333',
      },
    },
    commits: ['f'.repeat(40)],
    ambiguous: [],
    rewritten: new Map(),
    existingIssues: new Set(),
    failedReporters: [],
    unreadable: 0,
  });

  expect(outcome.title).toBe(
    'No noslop review of this change to src/b.ts, src/c.ts, src/d.ts: the patch changed since the review of eeeeeeeeeeee.',
  );
});

test('it fails at a new head when GitHub gives no whole file list, though the review keyed each file', () => {
  const outcome = buildCheckOutcome({
    findings: [],
    dispositions: [],
    summary: {
      head: 'e'.repeat(40),
      key: { files: { 'src/a.ts': '0123456789abcdef' } },
      reviews: 1,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: [],
    },
    confirmed: [],
    fixFailures: new Map(),
    currentHead: 'f'.repeat(40),
    currentKey: { head: 'f'.repeat(40) },
    commits: ['f'.repeat(40)],
    ambiguous: [],
    rewritten: new Map(),
    existingIssues: new Set(),
    failedReporters: [],
    unreadable: 0,
  });

  expect(outcome.title).toBe('No noslop review for this commit, ffffffffffff.');
});

test('it passes a review keyed on its head only at that head', () => {
  const outcome = buildCheckOutcome({
    findings: [],
    dispositions: [],
    summary: {
      head: 'f'.repeat(40),
      key: { head: 'f'.repeat(40) },
      reviews: 1,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: [],
    },
    confirmed: [],
    fixFailures: new Map(),
    currentHead: 'f'.repeat(40),
    currentKey: { head: 'f'.repeat(40) },
    commits: ['f'.repeat(40)],
    ambiguous: [],
    rewritten: new Map(),
    existingIssues: new Set(),
    failedReporters: [],
    unreadable: 0,
  });

  expect(outcome.conclusion).toBe('success');
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
      reviews: 1,
      reported: [],
      failedCalls: 0,
      followUps: [],
      confirmed: [],
    },
    confirmed: [],
    fixFailures: new Map(),
    currentHead: 'f'.repeat(40),
    currentKey: { head: 'f'.repeat(40) },
    commits: ['f'.repeat(40)],
    ambiguous: [],
    rewritten: new Map(),
    existingIssues: new Set(),
    failedReporters: [],
    unreadable: 0,
  });

  expect(outcome.conclusion).toBe('success');
});
