import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunner } from '@noslop/runner';
import { createTestRepo } from '@noslop/testing';
import { readRebasedHead } from './read-rebased-head';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-rebased-head-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, runner: createRunner() };
}

test('it maps a reviewed head onto the branch commit a rebase made of it', async () => {
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
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
  ]);

  const rebased = await readRebasedHead(ctx.runner, {
    repoDir: repo.path,
    reviewed: repo.commits[2] ?? '',
    base: repo.commits[1] ?? '',
    head: repo.commits[4] ?? '',
  });

  expect(rebased).toStrictEqual({ head: repo.commits[3] ?? '', failure: null });
});

test('it maps a reviewed head past the commits of a base branch that rebased too', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    { message: 'Add the parser', files: { 'src/parse.ts': 'export const parse = 1;\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    { message: 'Describe the app', parent: 0, files: { 'README.md': '# app\n' } },
    { message: 'Add the parser', files: { 'src/parse.ts': 'export const parse = 1;\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
  ]);

  const rebased = await readRebasedHead(ctx.runner, {
    repoDir: repo.path,
    reviewed: repo.commits[2] ?? '',
    base: repo.commits[4] ?? '',
    head: repo.commits[5] ?? '',
  });

  expect(rebased).toStrictEqual({ head: repo.commits[5] ?? '', failure: null });
});

test('it maps no head when the rebase changed the patch of a reviewed commit', async () => {
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
      message: 'Add the scanner',
      parent: 1,
      files: { 'src/scan.ts': 'export const none = 0;\nexport const separator = "";\n' },
    },
  ]);

  const rebased = await readRebasedHead(ctx.runner, {
    repoDir: repo.path,
    reviewed: repo.commits[2] ?? '',
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
  });

  expect(rebased).toStrictEqual({
    head: null,
    failure: `the rebase changed the patch of the reviewed commit ${(repo.commits[2] ?? '').slice(0, 12)}`,
  });
});

test('it maps no head when a reviewed commit is empty', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    { message: 'Describe the app', parent: 0, files: { 'README.md': '# app\n' } },
    { message: 'Start the scanner', parent: 0, files: {} },
    { message: 'Start the scanner', parent: 1, files: {} },
  ]);

  const rebased = await readRebasedHead(ctx.runner, {
    repoDir: repo.path,
    reviewed: repo.commits[2] ?? '',
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
  });

  expect(rebased).toStrictEqual({
    head: null,
    failure: `the reviewed commit ${(repo.commits[2] ?? '').slice(0, 12)} has no patch to match`,
  });
});

test('it maps no head when the reviewed range holds a merge', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    { message: 'Describe the app', parent: 0, files: { 'README.md': '# app\n' } },
    {
      message: 'Add the scanner',
      parent: 0,
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    { message: 'Merge the base', merged: 1, files: {} },
    {
      message: 'Add the scanner',
      parent: 1,
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
  ]);

  const rebased = await readRebasedHead(ctx.runner, {
    repoDir: repo.path,
    reviewed: repo.commits[3] ?? '',
    base: repo.commits[1] ?? '',
    head: repo.commits[4] ?? '',
  });

  expect(rebased).toStrictEqual({
    head: null,
    failure: `the merge ${(repo.commits[3] ?? '').slice(0, 12)} takes a full review`,
  });
});

test('it maps no head when the rebase squashed the reviewed commits', async () => {
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
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
  ]);

  const rebased = await readRebasedHead(ctx.runner, {
    repoDir: repo.path,
    reviewed: repo.commits[3] ?? '',
    base: repo.commits[1] ?? '',
    head: repo.commits[4] ?? '',
  });

  expect(rebased).toStrictEqual({
    head: null,
    failure: 'the branch holds 1 of the 2 reviewed commits past the base',
  });
});

test('it maps no head when the reviewed head holds no commit past the base', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    { message: 'Describe the app', parent: 0, files: { 'README.md': '# app\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
  ]);

  const rebased = await readRebasedHead(ctx.runner, {
    repoDir: repo.path,
    reviewed: repo.commits[0] ?? '',
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
  });

  expect(rebased).toStrictEqual({
    head: null,
    failure: `the reviewed head ${(repo.commits[0] ?? '').slice(0, 12)} holds no commit past the base`,
  });
});

test('it maps no head when the repo holds no commit of the reviewed head', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
  ]);

  const rebased = await readRebasedHead(ctx.runner, {
    repoDir: repo.path,
    reviewed: 'a'.repeat(40),
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
  });

  expect(rebased).toStrictEqual({ head: null, failure: 'the repo holds no commit aaaaaaaaaaaa' });
});
