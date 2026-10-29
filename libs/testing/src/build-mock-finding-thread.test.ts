import { expect, test } from 'bun:test';
import { buildMockFindingThread } from './build-mock-finding-thread';

test('it builds a review thread with no replies for a finding the change wrote', () => {
  expect(buildMockFindingThread()).toStrictEqual({
    source: 'review',
    commentID: 41,
    body: 'Await the write',
    line: 12,
    startLine: 12,
    replies: [],
    answered: new Set(),
    marker: {
      id: '1111111111111111',
      title: 'Await the write',
      path: 'src/a.ts',
      lens: 'correctness',
      severity: 'P2',
      riskClass: null,
      writtenByChange: true,
    },
  });
});

test('it merges marker overrides into the default marker', () => {
  expect(
    buildMockFindingThread({ source: 'issue', marker: { id: '2222222222222222' } }),
  ).toMatchObject({
    source: 'issue',
    marker: { id: '2222222222222222', title: 'Await the write', path: 'src/a.ts' },
  });
});
