import { expect, test } from 'bun:test';
import { buildResolutionPrompt } from './build-resolution-prompt';

test('it joins the header, the correctness and security lenses, the task, and the merge with its hunks', () => {
  const prompt = buildResolutionPrompt({
    merge: 'c'.repeat(40),
    parents: ['a'.repeat(40), 'b'.repeat(40)],
    conflicted: ['src/options.ts'],
    files: [
      {
        path: 'src/options.ts',
        oldPath: 'src/options.ts',
        status: 'modified',
        binary: false,
        kind: 'code',
        addedLines: 1,
        deletedLines: 1,
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            lines: [
              { kind: 'deleted', text: '<<<<<<< ours', oldLine: 1, newLine: null },
              { kind: 'added', text: 'export const retries = 3;', oldLine: null, newLine: 1 },
            ],
          },
        ],
      },
    ],
  });

  const headings = prompt.split('\n').filter((line) => line.startsWith('# '));

  expect(headings).toStrictEqual([
    '# Lens: correctness',
    '# Lens: security',
    '# Resolution check',
    '# Input',
  ]);

  expect(prompt).toInclude(
    `The merge commit is ${'c'.repeat(40)}, with the parents ${'a'.repeat(40)} and ${'b'.repeat(40)}. git could not merge these files: \`src/options.ts\`.`,
  );

  expect(prompt).toInclude(
    '### src/options.ts (modified)\n\n```diff\n@@ -1,1 +1,1 @@\n       - <<<<<<< ours\n     1 + export const retries = 3;\n```',
  );
});

test('it names security as the only other lens in the correctness exclusion and leaves no placeholder', () => {
  const prompt = buildResolutionPrompt({
    merge: 'c'.repeat(40),
    parents: ['a'.repeat(40), 'b'.repeat(40)],
    conflicted: [],
    files: [],
  });

  expect(prompt).toInclude('2. A concern of another lens in this review: security.');
  expect(prompt).not.toInclude('{{');
});
