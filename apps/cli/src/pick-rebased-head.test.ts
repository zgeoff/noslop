import { expect, test } from 'bun:test';
import { pickRebasedHead } from './pick-rebased-head';

test('it picks the branch commit that matches the last reviewed commit', () => {
  expect(
    pickRebasedHead({
      reviewedHead: 'a200000000000000000000000000000000000000',
      reviewed: [
        { sha: 'a100000000000000000000000000000000000000', parents: 1 },
        { sha: 'a200000000000000000000000000000000000000', parents: 1 },
      ],
      branch: [
        { sha: 'b100000000000000000000000000000000000000', parents: 1 },
        { sha: 'b200000000000000000000000000000000000000', parents: 1 },
        { sha: 'b300000000000000000000000000000000000000', parents: 1 },
      ],
      patchIDs: new Map([
        ['a100000000000000000000000000000000000000', 'p1'],
        ['a200000000000000000000000000000000000000', 'p2'],
        ['b100000000000000000000000000000000000000', 'p1'],
        ['b200000000000000000000000000000000000000', 'p2'],
        ['b300000000000000000000000000000000000000', 'p3'],
      ]),
    }),
  ).toStrictEqual({ head: 'b200000000000000000000000000000000000000', failure: null });
});

test('it picks no head when the reviewed head holds no commit past the base', () => {
  expect(
    pickRebasedHead({
      reviewedHead: 'a100000000000000000000000000000000000000',
      reviewed: [],
      branch: [{ sha: 'b100000000000000000000000000000000000000', parents: 1 }],
      patchIDs: new Map(),
    }),
  ).toStrictEqual({
    head: null,
    failure: 'the reviewed head a10000000000 holds no commit past the base',
  });
});

test('it picks no head when a branch commit it would pair holds a merge', () => {
  expect(
    pickRebasedHead({
      reviewedHead: 'a100000000000000000000000000000000000000',
      reviewed: [{ sha: 'a100000000000000000000000000000000000000', parents: 1 }],
      branch: [{ sha: 'b100000000000000000000000000000000000000', parents: 2 }],
      patchIDs: new Map([['a100000000000000000000000000000000000000', 'p1']]),
    }),
  ).toStrictEqual({ head: null, failure: 'the merge b10000000000 takes a full review' });
});

test('it picks no head when the branch holds fewer commits than the reviewed range', () => {
  expect(
    pickRebasedHead({
      reviewedHead: 'a200000000000000000000000000000000000000',
      reviewed: [
        { sha: 'a100000000000000000000000000000000000000', parents: 1 },
        { sha: 'a200000000000000000000000000000000000000', parents: 1 },
      ],
      branch: [{ sha: 'b100000000000000000000000000000000000000', parents: 1 }],
      patchIDs: new Map([
        ['a100000000000000000000000000000000000000', 'p1'],
        ['a200000000000000000000000000000000000000', 'p2'],
        ['b100000000000000000000000000000000000000', 'p3'],
      ]),
    }),
  ).toStrictEqual({
    head: null,
    failure: 'the branch holds 1 of the 2 reviewed commits past the base',
  });
});

test('it picks no head when a reviewed commit has no patch id', () => {
  expect(
    pickRebasedHead({
      reviewedHead: 'a100000000000000000000000000000000000000',
      reviewed: [{ sha: 'a100000000000000000000000000000000000000', parents: 1 }],
      branch: [{ sha: 'b100000000000000000000000000000000000000', parents: 1 }],
      patchIDs: new Map(),
    }),
  ).toStrictEqual({
    head: null,
    failure: 'the reviewed commit a10000000000 has no patch to match',
  });
});

test('it picks no head when the paired branch commit has another patch id', () => {
  expect(
    pickRebasedHead({
      reviewedHead: 'a100000000000000000000000000000000000000',
      reviewed: [{ sha: 'a100000000000000000000000000000000000000', parents: 1 }],
      branch: [{ sha: 'b100000000000000000000000000000000000000', parents: 1 }],
      patchIDs: new Map([
        ['a100000000000000000000000000000000000000', 'p1'],
        ['b100000000000000000000000000000000000000', 'p9'],
      ]),
    }),
  ).toStrictEqual({
    head: null,
    failure: 'the rebase changed the patch of the reviewed commit a10000000000',
  });
});

test('it picks no head when the second of 2 reviewed commits pairs with another patch id', () => {
  expect(
    pickRebasedHead({
      reviewedHead: 'a200000000000000000000000000000000000000',
      reviewed: [
        { sha: 'a100000000000000000000000000000000000000', parents: 1 },
        { sha: 'a200000000000000000000000000000000000000', parents: 1 },
      ],
      branch: [
        { sha: 'b100000000000000000000000000000000000000', parents: 1 },
        { sha: 'b200000000000000000000000000000000000000', parents: 1 },
      ],
      patchIDs: new Map([
        ['a100000000000000000000000000000000000000', 'p1'],
        ['a200000000000000000000000000000000000000', 'p2'],
        ['b100000000000000000000000000000000000000', 'p1'],
        ['b200000000000000000000000000000000000000', 'p9'],
      ]),
    }),
  ).toStrictEqual({
    head: null,
    failure: 'the rebase changed the patch of the reviewed commit a20000000000',
  });
});
