import { expect, test } from 'bun:test';
import { pickFixParts } from './pick-fix-parts';

test('it reads every part, most needed first, when all of them fit', () => {
  expect(
    pickFixParts({
      findingPath: 'src/scan.ts',
      commitDiffs: [
        { kind: 'commit-diff', path: 'src/split.ts', text: '+  if (separator === "") throw;' },
        {
          kind: 'commit-diff',
          path: 'src/scan.ts',
          text: '+import { splitHeader } from "./split";',
        },
      ],
      headFiles: [
        { kind: 'head-file', path: 'src/split.ts', text: 'export function splitHeader() {}' },
        { kind: 'head-file', path: 'src/scan.ts', text: 'export const scan = splitHeader;' },
      ],
      netDiff: { kind: 'net-diff', path: null, text: '+export const scan = splitHeader;' },
      maxFileChars: 1000,
      budget: 10_000,
    }),
  ).toStrictEqual({
    parts: [
      { kind: 'commit-diff', path: 'src/scan.ts', text: '+import { splitHeader } from "./split";' },
      { kind: 'commit-diff', path: 'src/split.ts', text: '+  if (separator === "") throw;' },
      { kind: 'head-file', path: 'src/scan.ts', text: 'export const scan = splitHeader;' },
      { kind: 'head-file', path: 'src/split.ts', text: 'export function splitHeader() {}' },
      { kind: 'net-diff', path: null, text: '+export const scan = splitHeader;' },
    ],
    leftOut: [],
  });
});

test('it leaves out the net diff, then the largest whole file, then the largest other diff as the budget shrinks', () => {
  const picked = pickFixParts({
    findingPath: 'src/scan.ts',
    commitDiffs: [
      { kind: 'commit-diff', path: 'src/scan.ts', text: 'a'.repeat(100) },
      { kind: 'commit-diff', path: 'data/headers.txt', text: 'b'.repeat(400) },
      { kind: 'commit-diff', path: 'src/split.ts', text: 'c'.repeat(100) },
    ],
    headFiles: [
      { kind: 'head-file', path: 'data/headers.txt', text: 'd'.repeat(400) },
      { kind: 'head-file', path: 'src/split.ts', text: 'e'.repeat(100) },
    ],
    netDiff: { kind: 'net-diff', path: null, text: 'f'.repeat(700) },
    maxFileChars: 1000,
    budget: 900,
  });

  expect(picked?.parts.map((part) => [part.kind, part.path])).toStrictEqual([
    ['commit-diff', 'src/scan.ts'],
    ['commit-diff', 'src/split.ts'],
    ['commit-diff', 'data/headers.txt'],
    ['head-file', 'src/split.ts'],
  ]);

  expect(picked?.leftOut.map((part) => [part.kind, part.path])).toStrictEqual([
    ['head-file', 'data/headers.txt'],
    ['net-diff', null],
  ]);
});

test('it leaves out a part past the file limit though the budget has room for it', () => {
  const picked = pickFixParts({
    findingPath: 'src/scan.ts',
    commitDiffs: [
      { kind: 'commit-diff', path: 'src/scan.ts', text: 'a'.repeat(10) },
      { kind: 'commit-diff', path: 'data/headers.txt', text: 'b'.repeat(200) },
    ],
    headFiles: [],
    netDiff: { kind: 'net-diff', path: null, text: 'c'.repeat(10) },
    maxFileChars: 100,
    budget: 10_000,
  });

  expect(picked?.leftOut.map((part) => [part.kind, part.path])).toStrictEqual([
    ['commit-diff', 'data/headers.txt'],
  ]);
});

test("it picks nothing when the fix commit's diff of the finding's file passes the budget", () => {
  expect(
    pickFixParts({
      findingPath: 'src/scan.ts',
      commitDiffs: [{ kind: 'commit-diff', path: 'src/scan.ts', text: 'a'.repeat(500) }],
      headFiles: [],
      netDiff: { kind: 'net-diff', path: null, text: '' },
      maxFileChars: 1000,
      budget: 100,
    }),
  ).toBeNull();
});

test("it picks nothing when the prompt passes the budget with no part, though the fix commit leaves the finding's file alone", () => {
  expect(
    pickFixParts({
      findingPath: 'src/scan.ts',
      commitDiffs: [
        { kind: 'commit-diff', path: 'src/split.ts', text: '+  if (separator === "") throw;' },
      ],
      headFiles: [],
      netDiff: { kind: 'net-diff', path: null, text: '' },
      maxFileChars: 1000,
      budget: -1,
    }),
  ).toBeNull();
});
