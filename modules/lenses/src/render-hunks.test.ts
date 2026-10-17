import { expect, test } from 'bun:test';
import { renderHunks } from './render-hunks';

test('it numbers each head line and leaves a deleted line unnumbered', () => {
  expect(
    renderHunks([
      {
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
            oldLines: 2,
            newStart: 1,
            newLines: 2,
            lines: [
              { kind: 'context', text: 'const a = 1;', oldLine: 1, newLine: 1 },
              { kind: 'deleted', text: 'const b = 2;', oldLine: 2, newLine: null },
              { kind: 'added', text: 'const b = 3;', oldLine: null, newLine: 2 },
            ],
          },
        ],
      },
    ]),
  ).toMatchInlineSnapshot(`
    "### src/a.ts (modified)

    \`\`\`diff
    @@ -1,2 +1,2 @@
         1   const a = 1;
           - const b = 2;
         2 + const b = 3;
    \`\`\`"
  `);
});

test('it names the old path of a renamed file', () => {
  expect(
    renderHunks([
      {
        path: 'src/b.ts',
        oldPath: 'src/a.ts',
        status: 'renamed',
        binary: true,
        kind: 'code',
        addedLines: 0,
        deletedLines: 0,
        hunks: [],
      },
    ]),
  ).toBe('### src/b.ts (renamed from src/a.ts)\n\nA binary file.');
});
