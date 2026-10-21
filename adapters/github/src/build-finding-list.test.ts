import { expect, test } from 'bun:test';
import { buildFindingList } from './build-finding-list';

test('it counts a fixed answer as fixed only when a fix call confirmed that answer', () => {
  expect(
    buildFindingList({
      findings: [
        {
          id: '1111111111111111',
          title: 'Reject an empty separator',
          path: 'src/scan.ts',
          lens: 'correctness',
          severity: 'P2',
          riskClass: null,
          writtenByChange: true,
        },
        {
          id: '2222222222222222',
          title: 'Trim the header value',
          path: 'src/parse.ts',
          lens: 'correctness',
          severity: 'P3',
          riskClass: null,
          writtenByChange: true,
        },
      ],
      dispositions: [
        {
          findingID: '1111111111111111',
          kind: 'fixed',
          value: '1a2b3c4',
          author: 'dev',
          authorIsOwner: false,
          source: 'github',
          at: '2026-10-20T10:00:00Z',
        },
        {
          findingID: '2222222222222222',
          kind: 'fixed',
          value: '5d6e7f8',
          author: 'dev',
          authorIsOwner: false,
          source: 'github',
          at: '2026-10-20T10:01:00Z',
        },
      ],
      reported: [],
      confirmed: ['1111111111111111:1a2b3c4', '2222222222222222:9a8b7c6'],
      existingIssues: new Set(),
      unread: new Set(),
    }),
  ).toStrictEqual({
    findings: [
      {
        id: '1111111111111111',
        path: 'src/scan.ts',
        severity: 'P2',
        state: 'fixed',
        author: 'dev',
      },
      {
        id: '2222222222222222',
        path: 'src/parse.ts',
        severity: 'P3',
        state: 'open',
        author: 'dev',
      },
    ],
  });
});

test('it reads the latest answer of a finding, and its author', () => {
  expect(
    buildFindingList({
      findings: [
        {
          id: '1111111111111111',
          title: 'Reject an empty separator',
          path: 'src/scan.ts',
          lens: 'correctness',
          severity: 'P2',
          riskClass: null,
          writtenByChange: false,
        },
      ],
      dispositions: [
        {
          findingID: '1111111111111111',
          kind: 'not-a-defect',
          value: 'the caller checks the separator',
          author: 'dev',
          authorIsOwner: false,
          source: 'github',
          at: '2026-10-20T10:00:00Z',
        },
        {
          findingID: '1111111111111111',
          kind: 'accepted-risk',
          value: 'a script that runs once',
          author: 'maintainer',
          authorIsOwner: true,
          source: 'github',
          at: '2026-10-20T11:00:00Z',
        },
      ],
      reported: [],
      confirmed: [],
      existingIssues: new Set(),
      unread: new Set(),
    }),
  ).toStrictEqual({
    findings: [
      {
        id: '1111111111111111',
        path: 'src/scan.ts',
        severity: 'P2',
        state: 'accepted-risk',
        author: 'maintainer',
      },
    ],
  });
});
