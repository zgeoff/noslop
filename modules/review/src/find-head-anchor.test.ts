import { expect, test } from 'bun:test';
import { findHeadAnchor } from './find-head-anchor';

test('it keeps the lines when no hunk changes the file', () => {
  expect(findHeadAnchor([], { startLine: 12, endLine: 14 })).toStrictEqual({
    startLine: 12,
    endLine: 14,
  });
});

test.each([
  ['3 lines added above', { oldStart: 4, oldLines: 0, newLines: 3 }, 15, 17],
  ['2 lines removed above', { oldStart: 2, oldLines: 2, newLines: 0 }, 10, 12],
  ['a line rewritten as 2 above', { oldStart: 5, oldLines: 1, newLines: 2 }, 13, 15],
  ['lines changed below', { oldStart: 20, oldLines: 3, newLines: 1 }, 12, 14],
])('it moves the lines by %s', (_, hunk, startLine, endLine) => {
  expect(findHeadAnchor([hunk], { startLine: 12, endLine: 14 })).toStrictEqual({
    startLine,
    endLine,
  });
});

test('it adds the shift of each hunk above the lines', () => {
  const hunks = [
    { oldStart: 2, oldLines: 0, newLines: 4 },
    { oldStart: 8, oldLines: 1, newLines: 0 },
  ];

  expect(findHeadAnchor(hunks, { startLine: 12, endLine: 12 })).toStrictEqual({
    startLine: 15,
    endLine: 15,
  });
});

test.each([
  ['a hunk that rewrites a line of the span', { oldStart: 13, oldLines: 1, newLines: 1 }],
  ['a hunk that removes the first line of the span', { oldStart: 12, oldLines: 1, newLines: 0 }],
  ['a hunk that adds lines inside the span', { oldStart: 12, oldLines: 0, newLines: 2 }],
])('it traces no lines past %s', (_, hunk) => {
  expect(findHeadAnchor([hunk], { startLine: 12, endLine: 14 })).toBeNull();
});

test('it keeps the fields of the span beside its lines', () => {
  const anchor = { path: 'src/rows.ts', startLine: 6, endLine: 6 };

  expect(findHeadAnchor([{ oldStart: 1, oldLines: 0, newLines: 1 }], anchor)).toStrictEqual({
    path: 'src/rows.ts',
    startLine: 7,
    endLine: 7,
  });
});
