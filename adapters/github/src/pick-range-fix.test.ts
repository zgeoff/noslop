import { expect, test } from 'bun:test';
import { pickRangeFix } from './pick-range-fix';

test('it picks the branch commit when the range holds it', () => {
  expect(
    pickRangeFix({
      range: ['a'.repeat(40), 'c'.repeat(40)],
      match: 'c'.repeat(40),
      named: 'c'.repeat(7),
      branchCommits: ['c'.repeat(40)],
      changes: null,
    }),
  ).toStrictEqual({ kind: 'found', commit: 'c'.repeat(40) });
});

test('it picks the one range commit the answer names', () => {
  expect(
    pickRangeFix({
      range: ['a'.repeat(40), 'b'.repeat(40)],
      match: 'd'.repeat(40),
      named: 'b'.repeat(7),
      branchCommits: ['d'.repeat(40)],
      changes: null,
    }),
  ).toStrictEqual({ kind: 'found', commit: 'b'.repeat(40) });
});

test('it picks none when every range commit is on the branch', () => {
  expect(
    pickRangeFix({
      range: ['a'.repeat(40)],
      match: 'd'.repeat(40),
      named: 'd'.repeat(7),
      branchCommits: ['a'.repeat(40), 'd'.repeat(40)],
      changes: null,
    }),
  ).toStrictEqual({ kind: 'none' });
});

test('it asks for the patches of the range commits off the branch before they are read', () => {
  expect(
    pickRangeFix({
      range: ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)],
      match: 'd'.repeat(40),
      named: 'd'.repeat(7),
      branchCommits: ['c'.repeat(40), 'd'.repeat(40)],
      changes: null,
    }),
  ).toStrictEqual({ kind: 'read', candidates: ['a'.repeat(40), 'b'.repeat(40)] });
});

test('it picks the one range commit off the branch with the patch of the fix', () => {
  expect(
    pickRangeFix({
      range: ['a'.repeat(40), 'b'.repeat(40)],
      match: 'd'.repeat(40),
      named: 'd'.repeat(7),
      branchCommits: ['d'.repeat(40)],
      changes: {
        fix: { sha: 'd'.repeat(40), fingerprint: 'total' },
        candidates: [
          { sha: 'a'.repeat(40), fingerprint: 'sum' },
          { sha: 'b'.repeat(40), fingerprint: 'total' },
        ],
      },
    }),
  ).toStrictEqual({ kind: 'found', commit: 'b'.repeat(40) });
});

test('it picks none when 2 range commits off the branch share the patch of the fix', () => {
  expect(
    pickRangeFix({
      range: ['a'.repeat(40), 'b'.repeat(40)],
      match: 'd'.repeat(40),
      named: 'd'.repeat(7),
      branchCommits: ['d'.repeat(40)],
      changes: {
        fix: { sha: 'd'.repeat(40), fingerprint: 'total' },
        candidates: [
          { sha: 'a'.repeat(40), fingerprint: 'total' },
          { sha: 'b'.repeat(40), fingerprint: 'total' },
        ],
      },
    }),
  ).toStrictEqual({ kind: 'none' });
});

test('it picks none when GitHub gives no whole patch of the fix', () => {
  expect(
    pickRangeFix({
      range: ['a'.repeat(40)],
      match: 'd'.repeat(40),
      named: 'd'.repeat(7),
      branchCommits: ['d'.repeat(40)],
      changes: {
        fix: { sha: 'd'.repeat(40), fingerprint: null },
        candidates: [{ sha: 'a'.repeat(40), fingerprint: null }],
      },
    }),
  ).toStrictEqual({ kind: 'none' });
});

test('it picks none when GitHub holds no commit of the fix', () => {
  expect(
    pickRangeFix({
      range: ['a'.repeat(40)],
      match: 'd'.repeat(40),
      named: 'd'.repeat(7),
      branchCommits: ['d'.repeat(40)],
      changes: { fix: null, candidates: [{ sha: 'a'.repeat(40), fingerprint: 'total' }] },
    }),
  ).toStrictEqual({ kind: 'none' });
});
