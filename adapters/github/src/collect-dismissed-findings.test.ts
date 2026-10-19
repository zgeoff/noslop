import { expect, test } from 'bun:test';
import { collectDismissedFindings } from './collect-dismissed-findings';

test('it lists a finding whose latest typed reply is not-a-defect, past a later free-text reply', () => {
  expect(
    collectDismissedFindings([
      {
        source: 'review',
        commentID: 41,
        body: 'Await the write',
        marker: {
          id: '1111111111111111',
          title: 'Await the write',
          path: 'src/a.ts',
          lens: 'correctness',
          severity: 'P2',
          riskClass: null,
          writtenByChange: true,
          criterion: 'wrong-behaviour-edge-path',
          rule: null,
          head: 'a'.repeat(40),
        },
        line: 12,
        startLine: 11,
        replies: [
          { id: 43, body: 'Thanks, noted.', author: 'dev', at: '2026-10-17T11:00:00.000Z' },
          {
            id: 42,
            body: 'not-a-defect the caller awaits it',
            author: 'dev',
            at: '2026-10-17T10:00:00.000Z',
          },
        ],
        answered: new Set(),
      },
    ]),
  ).toStrictEqual([
    {
      id: '1111111111111111',
      path: 'src/a.ts',
      criterion: 'wrong-behaviour-edge-path',
      rule: null,
      head: 'a'.repeat(40),
      startLine: 11,
      endLine: 12,
    },
  ]);
});

test('it leaves out a finding answered not-a-defect and then fixed', () => {
  expect(
    collectDismissedFindings([
      {
        source: 'review',
        commentID: 41,
        body: 'Await the write',
        marker: {
          id: '1111111111111111',
          title: 'Await the write',
          path: 'src/a.ts',
          lens: 'correctness',
          severity: 'P2',
          riskClass: null,
          writtenByChange: true,
        },
        line: 12,
        startLine: 12,
        replies: [
          {
            id: 42,
            body: 'not-a-defect the caller awaits it',
            author: 'dev',
            at: '2026-10-17T10:00:00.000Z',
          },
          { id: 43, body: 'fixed 1a2b3c4', author: 'dev', at: '2026-10-17T11:00:00.000Z' },
        ],
        answered: new Set(),
      },
    ]),
  ).toStrictEqual([]);
});

test('it lists a finding outside the diff with no lines and a marker from before the rule with no rule', () => {
  expect(
    collectDismissedFindings([
      {
        source: 'issue',
        commentID: 41,
        body: 'Await the write',
        marker: {
          id: '1111111111111111',
          title: 'Await the write',
          path: 'src/a.ts',
          lens: 'correctness',
          severity: 'P2',
          riskClass: null,
          writtenByChange: false,
        },
        line: null,
        startLine: null,
        replies: [
          {
            id: 42,
            body: 'not-a-defect the caller awaits it',
            author: 'dev',
            at: '2026-10-17T10:00:00.000Z',
          },
        ],
        answered: new Set(),
      },
    ]),
  ).toStrictEqual([
    {
      id: '1111111111111111',
      path: 'src/a.ts',
      criterion: null,
      rule: null,
      head: null,
      startLine: null,
      endLine: null,
    },
  ]);
});
