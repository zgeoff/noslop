import { expect, test } from 'bun:test';
import { buildMockFindingThread } from '@noslop/testing';
import { collectDismissedFindings } from './collect-dismissed-findings';

test('it lists a finding whose latest typed reply is not-a-defect, past a later free-text reply', () => {
  const thread = buildMockFindingThread({
    marker: {
      id: '1111111111111111',
      path: 'src/a.ts',
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
  });

  expect(collectDismissedFindings([thread])).toStrictEqual([
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
      buildMockFindingThread({
        replies: [
          {
            id: 42,
            body: 'not-a-defect the caller awaits it',
            author: 'dev',
            at: '2026-10-17T10:00:00.000Z',
          },
          { id: 43, body: 'fixed 1a2b3c4', author: 'dev', at: '2026-10-17T11:00:00.000Z' },
        ],
      }),
    ]),
  ).toStrictEqual([]);
});

test('it lists a finding outside the diff with no lines and a marker from before the rule with no rule', () => {
  expect(
    collectDismissedFindings([
      buildMockFindingThread({
        source: 'issue',
        marker: { id: '1111111111111111', path: 'src/a.ts', writtenByChange: false },
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
      }),
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

test('it lists only the folded finding that a reply of one line per finding answers not-a-defect', () => {
  const replies = [
    {
      id: 42,
      body: '1111111111111111 fixed 1a2b3c4\n2222222222222222 not-a-defect the caller awaits it',
      author: 'dev',
      at: '2026-10-17T10:00:00.000Z',
    },
  ];

  expect(
    collectDismissedFindings([
      buildMockFindingThread({ marker: { id: '1111111111111111' }, replies }),
      buildMockFindingThread({
        marker: { id: '2222222222222222', path: 'src/b.ts' },
        line: 4,
        startLine: 4,
        replies,
      }),
    ]),
  ).toStrictEqual([
    {
      id: '2222222222222222',
      path: 'src/b.ts',
      criterion: null,
      rule: null,
      head: null,
      startLine: 4,
      endLine: 4,
    },
  ]);
});

test('it lists no folded finding for a reply whose last line holds an id with no disposition', () => {
  const replies = [
    {
      id: 42,
      body: '1111111111111111 not-a-defect the caller awaits it\n2222222222222222',
      author: 'dev',
      at: '2026-10-17T10:00:00.000Z',
    },
  ];

  expect(
    collectDismissedFindings([
      buildMockFindingThread({ marker: { id: '1111111111111111' }, replies }),
      buildMockFindingThread({ marker: { id: '2222222222222222' }, replies }),
    ]),
  ).toStrictEqual([]);
});
