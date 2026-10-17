import { expect, test } from 'bun:test';
import { buildCallPrompt } from './build-call-prompt';

test('it joins the header, each lens section in order and each slice once', () => {
  const prompt = buildCallPrompt({
    lenses: ['naming-shape-and-comments', 'architecture-and-boundaries'],
    files: [
      {
        path: 'src/a.ts',
        oldPath: null,
        status: 'added',
        binary: false,
        kind: 'code',
        addedLines: 1,
        deletedLines: 0,
        hunks: [
          {
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: 1,
            lines: [{ kind: 'added', text: 'export const a = 1;', oldLine: null, newLine: 1 }],
          },
        ],
      },
    ],
    slices: {
      functions: [],
      reuse: [],
      guards: [],
      throws: [],
      writes: [],
      security: [],
      edges: [],
      config: [],
      tests: [],
      instructions: [],
      prose: [],
      comments: { commentLines: 0, codeLines: 1, perThousand: 0, target: 120 },
      interfaces: [
        { path: 'src/a.ts', startLine: 1, endLine: 1 },
        { path: 'src/b.ts', startLine: 1, endLine: 1 },
      ],
      migrations: [],
      events: [],
    },
    rules: [{ name: 'Context goes last', body: '1. Pass the context last.' }],
    title: 'feat: a',
    body: '',
    linkedIssue: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    task: null,
  });

  const input = prompt.slice(prompt.indexOf('# Input'));

  expect([
    prompt.indexOf('# Lens: naming-shape-and-comments') <
      prompt.indexOf('# Lens: architecture-and-boundaries'),
    prompt.split('## Slice: functions').length,
    prompt.includes('{{criteria}}'),
  ]).toStrictEqual([true, 2, false]);

  expect(input).toMatchInlineSnapshot(`
    "# Input

    The change runs from commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa to commit bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.

    ## Rules file

    ### Context goes last

    1. Pass the context last.

    ## Hunks

    ### src/a.ts (added)

    \`\`\`diff
    @@ -0,0 +1,1 @@
         1 + export const a = 1;
    \`\`\`

    ## Slice: functions

    \`\`\`json
    []
    \`\`\`

    ## Slice: comments

    \`\`\`json
    {
      "commentLines": 0,
      "codeLines": 1,
      "perThousand": 0,
      "target": 120
    }
    \`\`\`

    ## Slice: interfaces

    \`\`\`json
    [
      {
        "path": "src/a.ts",
        "startLine": 1,
        "endLine": 1
      }
    ]
    \`\`\`
    "
  `);
});

test('it tells the lenses to report no taste finding when the repo names no rules file', () => {
  const prompt = buildCallPrompt({
    lenses: ['tests'],
    files: [],
    slices: {
      functions: [],
      reuse: [],
      guards: [],
      throws: [],
      writes: [],
      security: [],
      edges: [],
      config: [],
      tests: [],
      instructions: [],
      prose: [],
      comments: { commentLines: 0, codeLines: 0, perThousand: 0, target: 120 },
      interfaces: [],
      migrations: [],
      events: [],
    },
    rules: null,
    title: 'test: a',
    body: 'Adds a test.',
    linkedIssue: null,
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
    task: 'Check each finding again.',
  });

  expect([
    prompt.includes('The repo names no rules file, so report no taste finding.'),
    prompt.endsWith('# Task\n\nCheck each finding again.\n'),
  ]).toStrictEqual([true, true]);
});
