import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunner } from '@noslop/runner';
import { createTestRepo } from '@noslop/testing';
import { readFixFloors } from './read-fix-floors';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-fix-floors-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, runner: createRunner() };
}

test('it gives a posting head a rebase rewrote its branch commit beside it, and keeps a held lens head', async () => {
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

  const floors = await readFixFloors(ctx.runner, {
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: repo.commits[4] ?? '',
    reviewBase: null,
    lensHead: repo.commits[3] ?? '',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/scan.ts',
        line: 2,
        comment: 'Reject an empty separator.',
        commit: repo.commits[4] ?? '',
        postedHead: repo.commits[2] ?? '',
      },
      {
        id: '2222222222222222',
        title: 'Name the separator',
        lens: 'design',
        path: 'src/scan.ts',
        line: 2,
        comment: 'Name the separator.',
        commit: repo.commits[4] ?? '',
        postedHead: repo.commits[3] ?? '',
      },
      {
        id: '3333333333333333',
        title: 'Test the separator',
        lens: 'tests',
        path: 'src/scan.ts',
        line: null,
        comment: 'Test the separator.',
        commit: repo.commits[4] ?? '',
        postedHead: null,
      },
    ],
  });

  expect(floors).toStrictEqual({
    lensHead: repo.commits[3] ?? '',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/scan.ts',
        line: 2,
        comment: 'Reject an empty separator.',
        commit: repo.commits[4] ?? '',
        postedHead: repo.commits[2] ?? '',
        postedBranchHead: repo.commits[3] ?? '',
      },
      {
        id: '2222222222222222',
        title: 'Name the separator',
        lens: 'design',
        path: 'src/scan.ts',
        line: 2,
        comment: 'Name the separator.',
        commit: repo.commits[4] ?? '',
        postedHead: repo.commits[3] ?? '',
      },
      {
        id: '3333333333333333',
        title: 'Test the separator',
        lens: 'tests',
        path: 'src/scan.ts',
        line: null,
        comment: 'Test the separator.',
        commit: repo.commits[4] ?? '',
        postedHead: null,
      },
    ],
  });
});

test('it drops a lens head a rebase took off the branch, and keeps a posting head whose patch the rebase changed', async () => {
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

  const floors = await readFixFloors(ctx.runner, {
    repoDir: repo.path,
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
    reviewBase: null,
    lensHead: repo.commits[2] ?? '',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/scan.ts',
        line: 2,
        comment: 'Reject an empty separator.',
        commit: repo.commits[3] ?? '',
        postedHead: repo.commits[2] ?? '',
      },
    ],
  });

  expect(floors).toStrictEqual({
    lensHead: null,
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/scan.ts',
        line: 2,
        comment: 'Reject an empty separator.',
        commit: repo.commits[3] ?? '',
        postedHead: repo.commits[2] ?? '',
      },
    ],
  });
});

test('it gives a posting head its branch commit past a lower layer that squash-merged', async () => {
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
      message: 'Add the parser (#4)',
      parent: 0,
      files: { 'src/parse.ts': 'export const parse = 2;\n' },
    },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
  ]);

  const floors = await readFixFloors(ctx.runner, {
    repoDir: repo.path,
    base: repo.commits[3] ?? '',
    head: repo.commits[5] ?? '',
    reviewBase: repo.commits[1] ?? '',
    lensHead: repo.commits[2] ?? '',
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/scan.ts',
        line: 2,
        comment: 'Reject an empty separator.',
        commit: repo.commits[5] ?? '',
        postedHead: repo.commits[2] ?? '',
      },
    ],
  });

  expect(floors).toStrictEqual({
    lensHead: null,
    fixes: [
      {
        id: '1111111111111111',
        title: 'Reject an empty separator',
        lens: 'correctness',
        path: 'src/scan.ts',
        line: 2,
        comment: 'Reject an empty separator.',
        commit: repo.commits[5] ?? '',
        postedHead: repo.commits[2] ?? '',
        postedBranchHead: repo.commits[4] ?? '',
      },
    ],
  });
});
