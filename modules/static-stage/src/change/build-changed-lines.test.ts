import { expect, test } from 'bun:test';
import { buildChangedLines } from './build-changed-lines';

test('it marks added lines and the head line where a deleted line sat', () => {
  const lines = buildChangedLines({
    path: 'src/a.ts',
    oldPath: 'src/a.ts',
    status: 'modified',
    binary: false,
    kind: 'code',
    addedLines: 1,
    deletedLines: 1,
    hunks: [
      {
        oldStart: 1,
        oldLines: 4,
        newStart: 1,
        newLines: 4,
        lines: [
          { kind: 'context', text: 'a', oldLine: 1, newLine: 1 },
          { kind: 'deleted', text: 'b', oldLine: 2, newLine: null },
          { kind: 'context', text: 'c', oldLine: 3, newLine: 2 },
          { kind: 'added', text: 'd', oldLine: null, newLine: 3 },
          { kind: 'context', text: 'e', oldLine: 4, newLine: 4 },
        ],
      },
    ],
  });

  expect([
    [...lines.added],
    [...lines.touched].toSorted((left, right) => left - right),
  ]).toStrictEqual([[3], [2, 3]]);
});
