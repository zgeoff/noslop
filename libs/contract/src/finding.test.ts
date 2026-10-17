import { expect, test } from 'bun:test';
import type { Anchor, Finding } from './finding';
import { anchorSchema, findingSchema, secondLocationSchema } from './finding';

test('it accepts a complete CONFIRMED finding', () => {
  const payload: Finding = {
    id: '0123456789abcdef',
    lens: 'correctness',
    callID: 'A',
    title: 'Keep the items in the queue until the batch write succeeds',
    body: 'The loop deletes every item, then writes the batch.',
    anchor: { path: 'src/queue.ts', startLine: 12, endLine: 14 },
    secondLocation: {
      repo: 'example/consumer',
      commit: 'abc1234',
      path: 'src/read.ts',
      startLine: 3,
      endLine: 3,
    },
    severity: 'P2',
    criterion: 'wrong-behaviour-edge-path',
    verdict: 'CONFIRMED',
    writtenByChange: true,
    fix: 'Delete each item after the write succeeds.',
  };

  expect(findingSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it accepts a direct finding from the static stage', () => {
  const payload: Finding = {
    id: '0123456789abcdef',
    lens: 'static',
    callID: null,
    title: 'Add an assertion to the test',
    body: 'The test calls the unit and checks nothing.',
    anchor: { path: 'src/a.test.ts', startLine: 1, endLine: 4 },
    severity: 'P2',
    criterion: 'untested-change',
    verdict: 'CONFIRMED',
    writtenByChange: true,
  };

  expect(findingSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it rejects a PLAUSIBLE finding with no unverified fact', () => {
  const result = findingSchema.safeParse({
    id: '0123456789abcdef',
    lens: 'security',
    callID: 'B',
    title: 'Check the actor before the read',
    body: 'The query reads any row.',
    anchor: { path: 'src/db.ts', startLine: 4, endLine: 4 },
    severity: 'P1',
    criterion: 'security-defect',
    verdict: 'PLAUSIBLE',
    writtenByChange: true,
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['unverifiedFact'] });
});

test('it rejects a title longer than 80 characters', () => {
  const result = findingSchema.safeParse({
    id: '0123456789abcdef',
    lens: 'correctness',
    callID: 'A',
    title: 'x'.repeat(81),
    body: 'The loop deletes every item, then writes the batch.',
    anchor: { path: 'src/queue.ts', startLine: 12, endLine: 14 },
    severity: 'P2',
    criterion: 'wrong-behaviour-edge-path',
    verdict: 'CONFIRMED',
    writtenByChange: true,
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['title'] });
});

test('it rejects a lens that is not in the lens set', () => {
  const result = findingSchema.safeParse({
    id: '0123456789abcdef',
    lens: 'performance',
    callID: 'A',
    title: 'Keep the items in the queue until the batch write succeeds',
    body: 'The loop deletes every item, then writes the batch.',
    anchor: { path: 'src/queue.ts', startLine: 12, endLine: 14 },
    severity: 'P2',
    criterion: 'wrong-behaviour-edge-path',
    verdict: 'CONFIRMED',
    writtenByChange: true,
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['lens'] });
});

test('it rejects an anchor that spans more than 10 lines', () => {
  const result = anchorSchema.safeParse({ path: 'src/a.ts', startLine: 1, endLine: 11 });

  expect(result.error?.issues).toPartiallyContain({ path: ['endLine'] });
});

test('it accepts an anchor that spans exactly 10 lines', () => {
  const payload: Anchor = { path: 'src/a.ts', startLine: 1, endLine: 10 };

  expect(anchorSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it rejects an anchor that ends before it starts', () => {
  const result = anchorSchema.safeParse({ path: 'src/a.ts', startLine: 5, endLine: 4 });

  expect(result.error?.issues).toPartiallyContain({ path: ['endLine'] });
});

test('it rejects a second location that pins no commit', () => {
  const result = secondLocationSchema.safeParse({
    repo: 'example/consumer',
    commit: 'main',
    path: 'src/read.ts',
    startLine: 3,
    endLine: 3,
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['commit'] });
});
