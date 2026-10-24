import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunner } from '@noslop/runner';
import { createTestRepo } from '@noslop/testing';
import { buildNetChangeKey } from './build-net-change-key';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-net-change-key-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, runner: createRunner() };
}

test('it keys each file on its patch with the hunk headers cut, and a file with no patch on its blob', () => {
  const key = buildNetChangeKey({
    head: 'f'.repeat(40),
    isWhole: true,
    files: [
      {
        filename: 'src/scan.ts',
        status: 'modified',
        sha: 'a'.repeat(40),
        patch:
          '@@ -3,3 +3,3 @@ export function scan() {\n   const zero = 0;\n-  return zero;\n+  return 1;',
      },
      { filename: 'assets/logo.png', status: 'added', sha: 'b'.repeat(40) },
      {
        filename: 'src/read.ts',
        status: 'renamed',
        previous_filename: 'src/load.ts',
        sha: 'c'.repeat(40),
        patch: '',
      },
    ],
  });

  expect(key).toMatchInlineSnapshot(`
    {
      "files": {
        "assets/logo.png": "ac73c8c8add1d98e",
        "src/read.ts": "b938c709a50cf7e1",
        "src/scan.ts": "10faba259a0a0905",
      },
    }
  `);
});

test('it builds the same key from the same files', () => {
  const input = {
    head: 'f'.repeat(40),
    isWhole: true,
    files: [
      {
        filename: 'src/scan.ts',
        status: 'modified',
        sha: 'a'.repeat(40),
        patch: '@@ -1 +1 @@\n-one\n+two',
      },
    ],
  };

  expect(buildNetChangeKey(input)).toStrictEqual(buildNetChangeKey(input));
});

test('it keeps the key of a file across a clean rebase and a conflict-free merge of a base that moved its lines', async () => {
  const ctx = await setupTest();

  const lines = Array.from({ length: 20 }, (_, index) => `export const value${index} = ${index};`);

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/values.ts': `${lines.join('\n')}\n` } },
    {
      message: 'Raise value 15',
      files: { 'src/values.ts': `${lines.with(15, 'export const value15 = 150;').join('\n')}\n` },
    },
    {
      message: 'Open with a header',
      parent: 0,
      files: { 'src/values.ts': `// values\n// in order\n${lines.join('\n')}\n` },
    },
    {
      message: 'Raise value 15',
      files: {
        'src/values.ts': `// values\n// in order\n${lines.with(15, 'export const value15 = 150;').join('\n')}\n`,
      },
    },
    { message: 'Merge the base', parent: 1, merged: 2, files: {} },
  ]);

  const readPatch = async (base: number, head: number) => {
    const diff = await ctx.runner.run(
      ['git', 'diff', repo.commits[base] ?? '', repo.commits[head] ?? '', '--', 'src/values.ts'],
      { cwd: repo.path },
    );

    return diff.stdout.slice(diff.stdout.indexOf('@@')).trimEnd();
  };

  const patches = await Promise.all([readPatch(0, 1), readPatch(2, 3), readPatch(2, 4)]);

  const keys = patches.map((patch) =>
    buildNetChangeKey({
      head: 'f'.repeat(40),
      isWhole: true,
      files: [{ filename: 'src/values.ts', status: 'modified', sha: 'a'.repeat(40), patch }],
    }),
  );

  expect(patches[0]).not.toBe(patches[1]);
  expect(keys[1]).toStrictEqual(keys[0]);
  expect(keys[2]).toStrictEqual(keys[0]);
});

test('it tells apart 2 like edits whose hunks sit in different functions', () => {
  const first = buildNetChangeKey({
    head: 'e'.repeat(40),
    isWhole: true,
    files: [
      {
        filename: 'src/scan.ts',
        status: 'modified',
        sha: 'a'.repeat(40),
        patch:
          '@@ -3,3 +3,3 @@ function readHeader() {\n   const zero = 0;\n-  return zero;\n+  return 1;',
      },
    ],
  });

  const second = buildNetChangeKey({
    head: 'f'.repeat(40),
    isWhole: true,
    files: [
      {
        filename: 'src/scan.ts',
        status: 'modified',
        sha: 'a'.repeat(40),
        patch:
          '@@ -9,3 +9,3 @@ function readFooter() {\n   const zero = 0;\n-  return zero;\n+  return 1;',
      },
    ],
  });

  expect(second).not.toStrictEqual(first);
});

test('it moves the key of a file whose patch changed and keeps the key of the others', () => {
  const before = buildNetChangeKey({
    head: 'e'.repeat(40),
    isWhole: true,
    files: [
      {
        filename: 'src/a.ts',
        status: 'modified',
        sha: 'a'.repeat(40),
        patch: '@@ -1 +1 @@\n-one\n+two',
      },
      {
        filename: 'src/b.ts',
        status: 'modified',
        sha: 'b'.repeat(40),
        patch: '@@ -4 +4 @@\n-x\n+y',
      },
    ],
  });

  const after = buildNetChangeKey({
    head: 'f'.repeat(40),
    isWhole: true,
    files: [
      {
        filename: 'src/a.ts',
        status: 'modified',
        sha: 'c'.repeat(40),
        patch: '@@ -1 +1 @@\n-one\n+three',
      },
      {
        filename: 'src/b.ts',
        status: 'modified',
        sha: 'd'.repeat(40),
        patch: '@@ -9 +9 @@\n-x\n+y',
      },
    ],
  });

  if (!('files' in before && 'files' in after)) {
    throw new Error('the keys hold no files');
  }

  expect(after.files['src/a.ts']).not.toBe(before.files['src/a.ts']);
  expect(after.files['src/b.ts']).toBe(before.files['src/b.ts']);
});

test('it moves the key of a file with no patch when its blob changes', () => {
  const before = buildNetChangeKey({
    head: 'e'.repeat(40),
    isWhole: true,
    files: [{ filename: 'assets/logo.png', status: 'modified', sha: 'a'.repeat(40) }],
  });

  const after = buildNetChangeKey({
    head: 'f'.repeat(40),
    isWhole: true,
    files: [{ filename: 'assets/logo.png', status: 'modified', sha: 'b'.repeat(40) }],
  });

  expect(after).not.toStrictEqual(before);
});

test('it keys on the head when GitHub lists fewer files than the pull request changes', () => {
  expect(
    buildNetChangeKey({
      head: 'f'.repeat(40),
      isWhole: false,
      files: [
        { filename: 'src/a.ts', status: 'modified', sha: 'a'.repeat(40), patch: '@@ -1 +1 @@' },
      ],
    }),
  ).toStrictEqual({ head: 'f'.repeat(40) });
});

test('it keys on the head when the patch ids are too long for the summary marker', () => {
  const files = Array.from({ length: 1000 }, (_, index) => ({
    filename: `src/generated/module-${index}.ts`,
    status: 'added',
    sha: 'a'.repeat(40),
  }));

  expect(buildNetChangeKey({ head: 'f'.repeat(40), isWhole: true, files })).toStrictEqual({
    head: 'f'.repeat(40),
  });
});

test('it keys on the head when the patch ids pass the marker budget only once the marker escapes each >', () => {
  const files = Array.from({ length: 80 }, (_, index) => ({
    filename: `docs/${'>'.repeat(100)}-${index}.md`,
    status: 'added',
    sha: 'a'.repeat(40),
  }));

  expect(buildNetChangeKey({ head: 'f'.repeat(40), isWhole: true, files })).toStrictEqual({
    head: 'f'.repeat(40),
  });
});
