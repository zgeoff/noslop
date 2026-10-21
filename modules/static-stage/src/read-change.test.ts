import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILT_IN_DEFAULTS } from '@noslop/config';
import { createRunner } from '@noslop/runner';
import { createTestRepo } from '@noslop/testing';
import { readChange } from './read-change';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-change-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, runner: createRunner() };
}

test('it reads the changed files between 2 commits with their line counts', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\nexport const b = 2;\n' } },
    {
      message: 'head',
      files: { 'src/a.ts': 'export const a = 3;\nexport const b = 2;\n', 'docs/a.md': '# A\n' },
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config: BUILT_IN_DEFAULTS,
  });

  expect(change).toMatchObject({ base: repo.commits[0], head: repo.commits[1], excluded: [] });

  expect(
    change.files.map((file) => [
      file.path,
      file.status,
      file.kind,
      file.addedLines,
      file.deletedLines,
    ]),
  ).toStrictEqual([
    ['docs/a.md', 'added', 'prose', 1, 0],
    ['src/a.ts', 'modified', 'code', 1, 1],
  ]);
});

test('it reads a script with a shebang and no extension as code', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'README.md': '# Tools\n' } },
    {
      message: 'head',
      files: {
        'bin/deploy': '#!/bin/sh\necho deploying\n',
        'bin/notes': 'deploy before noon\n',
      },
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config: BUILT_IN_DEFAULTS,
  });

  expect(change.files.map((file) => [file.path, file.kind])).toStrictEqual([
    ['bin/deploy', 'code'],
    ['bin/notes', 'other'],
  ]);
});

test('it reads a shebang script as code when the hunks miss its first line or delete it', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'bin/deploy': '#!/bin/sh\n1\n2\n3\n4\n5\n6\n7\necho deploying\n',
        'bin/clean': '#!/bin/sh\nrm -rf dist\n',
      },
    },
    {
      message: 'head',
      files: {
        'bin/deploy': '#!/bin/sh\n1\n2\n3\n4\n5\n6\n7\necho deploying now\n',
        'bin/clean': null,
      },
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config: BUILT_IN_DEFAULTS,
  });

  expect(change.files.map((file) => [file.path, file.status, file.kind])).toStrictEqual([
    ['bin/clean', 'deleted', 'code'],
    ['bin/deploy', 'modified', 'code'],
  ]);
});

test('it leaves out lockfiles and other generated files', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    {
      message: 'head',
      files: { 'bun.lock': '{}\n', 'dist/a.js': 'a\n', 'src/a.ts': 'export const a = 2;\n' },
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config: BUILT_IN_DEFAULTS,
  });

  expect(change.files.map((file) => file.path)).toStrictEqual(['src/a.ts']);
  expect(change.excluded).toStrictEqual(['bun.lock', 'dist/a.js']);
});

test('it keeps the path of an empty new file, a path with a space and a quoted path', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a b.ts': 'export const a = 1;\n' } },
    {
      message: 'head',
      files: {
        'src/a b.ts': 'export const a = 2;\n',
        'src/empty.ts': '',
        'src/tab\there.ts': 'export const t = 1;\n',
      },
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: 'HEAD~1',
    head: 'HEAD',
    config: BUILT_IN_DEFAULTS,
  });

  expect(change.files.map((file) => [file.path, file.status])).toStrictEqual([
    ['src/a b.ts', 'modified'],
    ['src/empty.ts', 'added'],
    ['src/tab\there.ts', 'added'],
  ]);
});

test('it keeps to the files the pull request changes since its merge base after a merge from the base', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/total.ts': 'export const total = 0;\n', 'docs/guide.md': '# Guide\n' },
    },
    { message: 'Count one', files: { 'src/total.ts': 'export const total = 1;\n' } },
    { message: 'Expand the guide', files: { 'docs/guide.md': '# Guide\n\nRead me.\n' }, parent: 0 },
    {
      message: 'Merge main and count two',
      files: { 'src/total.ts': 'export const total = 2;\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
    mergeBase: repo.commits[2] ?? '',
    config: BUILT_IN_DEFAULTS,
  });

  expect(change.files.map((file) => [file.path, file.addedLines, file.deletedLines])).toStrictEqual(
    [['src/total.ts', 1, 1]],
  );
});

test('it keeps only the files the paths name, a rename from a named path among them, and lists no other', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/total.ts': 'export const total = 0;\n',
        'src/count.ts':
          'export const count = 0;\nexport const limit = 10;\nexport const step = 1;\n',
        'bun.lock': '{}\n',
      },
    },
    {
      message: 'head',
      files: {
        'src/total.ts': 'export const total = 1;\n',
        'src/count.ts': null,
        'src/tally.ts':
          'export const count = 0;\nexport const limit = 10;\nexport const step = 1;\n',
        'docs/guide.md': '# Guide\n',
        'bun.lock': '{ "lockfileVersion": 1 }\n',
      },
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    paths: ['src/count.ts', 'docs/guide.md'],
    config: BUILT_IN_DEFAULTS,
  });

  expect(change.files.map((file) => [file.path, file.status])).toStrictEqual([
    ['docs/guide.md', 'added'],
    ['src/tally.ts', 'renamed'],
  ]);

  expect(change.excluded).toStrictEqual([]);
});

test('it keeps a rename whose old path the pull request deletes when only its new path is the base branch file', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/old.ts': 'export const total = 0;\n',
        'src/new.ts': 'export const count = 1;\nexport const size = 2;\n',
      },
    },
    {
      message: 'Move the count',
      files: {
        'src/old.ts': 'export const count = 1;\nexport const size = 2;\n',
        'src/new.ts': null,
      },
    },
    {
      message: 'Drop the old file',
      files: {
        'src/old.ts': null,
        'src/new.ts': 'export const count = 1;\nexport const size = 2;\n',
      },
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    config: BUILT_IN_DEFAULTS,
  });

  expect(change.files.map((file) => [file.oldPath, file.path, file.status])).toStrictEqual([
    ['src/old.ts', 'src/new.ts', 'renamed'],
  ]);
});

test('it keeps the deletion of a path the pull request renames across 2 commits', async () => {
  const ctx = await setupTest();

  const content = 'export const count = 1;\nexport const size = 2;\nexport const total = 3;\n';

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/old.ts': content } },
    { message: 'Copy the counts', files: { 'src/new.ts': content } },
    { message: 'Drop the old counts', files: { 'src/old.ts': null } },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    config: BUILT_IN_DEFAULTS,
  });

  expect(change.files.map((file) => [file.path, file.status])).toStrictEqual([
    ['src/old.ts', 'deleted'],
  ]);
});

test('it lists every path the whole pull request changes, with both paths of a rename', async () => {
  const ctx = await setupTest();

  const content = 'export const count = 1;\nexport const size = 2;\nexport const total = 3;\n';

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/old.ts': content, 'src/gone.ts': 'export const gone = 1;\n' },
    },
    { message: 'Move the counts', files: { 'src/old.ts': null, 'src/new.ts': content } },
    {
      message: 'Drop gone and add a size',
      files: { 'src/gone.ts': null, 'src/size.ts': 'export const size = 1;\n' },
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    config: BUILT_IN_DEFAULTS,
  });

  expect(change.pullRequestPaths).toIncludeSameMembers([
    'src/gone.ts',
    'src/new.ts',
    'src/old.ts',
    'src/size.ts',
  ]);
});

test('it lists the files only the base branch changes apart after a merge from the base', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/total.ts': 'export const total = 0;\n', 'docs/guide.md': '# Guide\n' },
    },
    { message: 'Count one', files: { 'src/total.ts': 'export const total = 1;\n' } },
    { message: 'Expand the guide', files: { 'docs/guide.md': '# Guide\n\nRead me.\n' }, parent: 0 },
    {
      message: 'Merge main and count two',
      files: { 'src/total.ts': 'export const total = 2;\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
    mergeBase: repo.commits[2] ?? '',
    config: BUILT_IN_DEFAULTS,
  });

  expect(change.baseOnly?.map((file) => [file.path, file.status, file.addedLines])).toStrictEqual([
    ['docs/guide.md', 'modified', 2],
  ]);
});

test('it keeps both hunks of a file that the pull request and the base branch each change', async () => {
  const ctx = await setupTest();

  const lines = Array.from({ length: 20 }, (_, index) => `export const n${index} = ${index};`);

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/numbers.ts': `${lines.join('\n')}\n` } },
    {
      message: 'Change the first number',
      files: { 'src/numbers.ts': `${['export const n0 = 100;', ...lines.slice(1)].join('\n')}\n` },
    },
    {
      message: 'Change the last number',
      files: {
        'src/numbers.ts': `${[...lines.slice(0, 19), 'export const n19 = 119;'].join('\n')}\n`,
      },
      parent: 0,
    },
    {
      message: 'Merge main and change the second number',
      files: {
        'src/numbers.ts': `${[
          'export const n0 = 100;',
          'export const n1 = 101;',
          ...lines.slice(2, 19),
          'export const n19 = 119;',
        ].join('\n')}\n`,
      },
      parent: 1,
      merged: 2,
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
    mergeBase: repo.commits[2] ?? '',
    config: BUILT_IN_DEFAULTS,
  });

  expect(
    change.files.map((file) => [
      file.path,
      file.hunks.flatMap((hunk) =>
        hunk.lines.filter((line) => line.kind === 'added').map((line) => line.text),
      ),
    ]),
  ).toStrictEqual([['src/numbers.ts', ['export const n1 = 101;', 'export const n19 = 119;']]]);
});

test('it reads every file between 2 commits when no merge base limits the change', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/total.ts': 'export const total = 0;\n', 'docs/guide.md': '# Guide\n' },
    },
    { message: 'Count one', files: { 'src/total.ts': 'export const total = 1;\n' } },
    { message: 'Expand the guide', files: { 'docs/guide.md': '# Guide\n\nRead me.\n' }, parent: 0 },
    {
      message: 'Merge main and count two',
      files: { 'src/total.ts': 'export const total = 2;\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const change = await readChange({
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
    config: BUILT_IN_DEFAULTS,
  });

  expect(change.files.map((file) => file.path)).toStrictEqual(['docs/guide.md', 'src/total.ts']);
});

test('it rejects a ref that names no commit', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
  ]);

  expect(
    readChange({
      runner: ctx.runner,
      repoDir: repo.path,
      base: 'no-such-ref',
      head: 'HEAD',
      config: BUILT_IN_DEFAULTS,
    }),
  ).rejects.toThrowWithMessage(Error, /git rev-parse/u);
});
