import { expect, test } from 'bun:test';
import { parseDiff } from './parse-diff';

test('it reads a modified file with the old and new number of each line', () => {
  const diff = [
    'diff --git src/a.ts src/a.ts',
    'index 1111111..2222222 100644',
    '--- src/a.ts',
    '+++ src/a.ts',
    '@@ -1,3 +1,3 @@',
    ' export function div(a: number, b: number) {',
    '-  if (b === 0) return null;',
    '+  if (b = 0) return null;',
    '   return a / b;',
  ].join('\n');

  expect(parseDiff(diff)).toStrictEqual([
    {
      path: 'src/a.ts',
      oldPath: 'src/a.ts',
      status: 'modified',
      binary: false,
      hunks: [
        {
          oldStart: 1,
          oldLines: 3,
          newStart: 1,
          newLines: 3,
          lines: [
            {
              kind: 'context',
              text: 'export function div(a: number, b: number) {',
              oldLine: 1,
              newLine: 1,
            },
            { kind: 'deleted', text: '  if (b === 0) return null;', oldLine: 2, newLine: null },
            { kind: 'added', text: '  if (b = 0) return null;', oldLine: null, newLine: 2 },
            { kind: 'context', text: '  return a / b;', oldLine: 3, newLine: 3 },
          ],
        },
      ],
    },
  ]);
});

test('it reads an added file and a deleted file', () => {
  const diff = [
    'diff --git src/new.ts src/new.ts',
    'new file mode 100644',
    '--- /dev/null',
    '+++ src/new.ts',
    '@@ -0,0 +1 @@',
    '+export const a = 1;',
    'diff --git src/old.ts src/old.ts',
    'deleted file mode 100644',
    '--- src/old.ts',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-export const b = 2;',
  ].join('\n');

  expect(parseDiff(diff).map((file) => [file.path, file.status, file.oldPath])).toStrictEqual([
    ['src/new.ts', 'added', null],
    ['src/old.ts', 'deleted', 'src/old.ts'],
  ]);
});

test('it reads a rename with no content change', () => {
  const diff = [
    'diff --git src/a.ts src/b.ts',
    'similarity index 100%',
    'rename from src/a.ts',
    'rename to src/b.ts',
  ].join('\n');

  expect(parseDiff(diff)).toStrictEqual([
    { path: 'src/b.ts', oldPath: 'src/a.ts', status: 'renamed', binary: false, hunks: [] },
  ]);
});

test('it reads a binary file with no hunks', () => {
  const diff = [
    'diff --git logo.png logo.png',
    'new file mode 100644',
    'Binary files /dev/null and logo.png differ',
  ].join('\n');

  expect(parseDiff(diff)).toStrictEqual([
    { path: 'logo.png', oldPath: null, status: 'added', binary: true, hunks: [] },
  ]);
});

test('it reads a deleted line that starts with dashes as a line of the hunk', () => {
  const diff = [
    'diff --git notes.md notes.md',
    '--- notes.md',
    '+++ notes.md',
    '@@ -1,2 +1 @@',
    ' # Notes',
    '--- a rule',
  ].join('\n');

  expect(parseDiff(diff)[0]?.hunks[0]?.lines).toStrictEqual([
    { kind: 'context', text: '# Notes', oldLine: 1, newLine: 1 },
    { kind: 'deleted', text: '-- a rule', oldLine: 2, newLine: null },
  ]);
});
