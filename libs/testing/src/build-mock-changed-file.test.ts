import { expect, test } from 'bun:test';
import { buildMockChangedFile } from './build-mock-changed-file';

test('it builds a default changed file', () => {
  expect(buildMockChangedFile()).toStrictEqual({
    path: 'src/a.ts',
    oldPath: 'src/a.ts',
    status: 'modified',
    binary: false,
    kind: 'code',
    hunks: [
      {
        oldStart: 1,
        oldLines: 0,
        newStart: 1,
        newLines: 1,
        lines: [{ kind: 'added', text: 'export const a = 1;', oldLine: null, newLine: 1 }],
      },
    ],
    addedLines: 1,
    deletedLines: 0,
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockChangedFile({ path: 'docs/a.md', kind: 'prose' })).toMatchObject({
    path: 'docs/a.md',
    kind: 'prose',
    status: 'modified',
  });
});
