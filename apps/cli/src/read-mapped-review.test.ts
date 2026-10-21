import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunner } from '@noslop/runner';
import { createTestRepo } from '@noslop/testing';
import { readMappedReview } from './read-mapped-review';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-mapped-review-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, runner: createRunner() };
}

test('it maps the reviewed head when the rebase kept its patches', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    { message: 'Describe the app', parent: 0, files: { 'README.md': '# app\n' } },
    {
      message: 'Add the scanner',
      parent: 0,
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
    {
      message: 'Add the scanner',
      parent: 1,
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
  ]);

  const mapped = await readMappedReview(ctx.runner, {
    repoDir: repo.path,
    reviewed: repo.commits[3] ?? '',
    lensHead: repo.commits[2] ?? '',
    base: repo.commits[1] ?? '',
    head: repo.commits[5] ?? '',
    reviewBase: repo.commits[0] ?? '',
  });

  expect(mapped).toStrictEqual({
    from: repo.commits[3] ?? '',
    head: repo.commits[5] ?? '',
    failure: null,
  });
});

test('it maps the lens head when a fixes-only run carried the review onto a lower layer that rebased and then squash-merged', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the parser',
      parent: 0,
      files: { 'src/parse.ts': 'export const parse = 1;\n' },
    },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Add the parser',
      parent: 0,
      files: { 'src/parse.ts': 'export const parse = 2;\n' },
    },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Add the parser (#4)',
      parent: 0,
      files: { 'src/parse.ts': 'export const parse = 3;\n' },
    },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
  ]);

  const mapped = await readMappedReview(ctx.runner, {
    repoDir: repo.path,
    reviewed: repo.commits[4] ?? '',
    lensHead: repo.commits[2] ?? '',
    base: repo.commits[5] ?? '',
    head: repo.commits[6] ?? '',
    reviewBase: repo.commits[1] ?? '',
  });

  expect(mapped).toStrictEqual({
    from: repo.commits[2] ?? '',
    head: repo.commits[6] ?? '',
    failure: null,
  });
});

test('it gives the reviewed head and its failure when the lens head maps to no branch commit either', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Rename the zero constant',
      parent: 0,
      files: { 'src/scan.ts': 'export const none = 0;\n' },
    },
    {
      message: 'Add the scanner',
      parent: 0,
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
    {
      message: 'Add the scanner',
      parent: 1,
      files: { 'src/scan.ts': 'export const none = 0;\nexport const separator = "";\n' },
    },
  ]);

  const mapped = await readMappedReview(ctx.runner, {
    repoDir: repo.path,
    reviewed: repo.commits[3] ?? '',
    lensHead: repo.commits[2] ?? '',
    base: repo.commits[1] ?? '',
    head: repo.commits[4] ?? '',
    reviewBase: repo.commits[0] ?? '',
  });

  expect(mapped).toStrictEqual({
    from: repo.commits[3] ?? '',
    head: null,
    failure: 'the branch holds 1 of the 2 reviewed commits past the base',
  });
});

test('it counts from the pull request base when no fetch reaches the stored review base', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    { message: 'Describe the app', parent: 0, files: { 'README.md': '# app\n' } },
    {
      message: 'Add the scanner',
      parent: 0,
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Add the scanner',
      parent: 1,
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
  ]);

  const mapped = await readMappedReview(ctx.runner, {
    repoDir: repo.path,
    reviewed: repo.commits[2] ?? '',
    lensHead: repo.commits[2] ?? '',
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
    reviewBase: 'a'.repeat(40),
  });

  expect(mapped).toStrictEqual({
    from: repo.commits[2] ?? '',
    head: repo.commits[3] ?? '',
    failure: null,
  });
});

test('it fetches the lens history a clone lacks before it maps the lens head', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'origin'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the parser',
      parent: 0,
      files: { 'src/parse.ts': 'export const parse = 1;\n' },
    },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Add the parser',
      parent: 0,
      files: { 'src/parse.ts': 'export const parse = 2;\n' },
    },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Add the parser (#4)',
      parent: 0,
      files: { 'src/parse.ts': 'export const parse = 3;\n' },
    },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
  ]);

  const clone = join(ctx.directory, 'clone');

  await ctx.runner.run(['git', 'config', 'uploadpack.allowAnySHA1InWant', 'true'], {
    cwd: repo.path,
  });

  await ctx.runner.run(['git', 'init', '-q', clone], { cwd: ctx.directory });
  await ctx.runner.run(['git', 'remote', 'add', 'origin', repo.path], { cwd: clone });

  await ctx.runner.run(
    [
      'git',
      'fetch',
      '--quiet',
      'origin',
      repo.commits[4] ?? '',
      repo.commits[5] ?? '',
      repo.commits[6] ?? '',
    ],
    { cwd: clone },
  );

  const mapped = await readMappedReview(ctx.runner, {
    repoDir: clone,
    reviewed: repo.commits[4] ?? '',
    lensHead: repo.commits[2] ?? '',
    base: repo.commits[5] ?? '',
    head: repo.commits[6] ?? '',
    reviewBase: repo.commits[1] ?? '',
  });

  expect(mapped).toStrictEqual({
    from: repo.commits[2] ?? '',
    head: repo.commits[6] ?? '',
    failure: null,
  });
});
