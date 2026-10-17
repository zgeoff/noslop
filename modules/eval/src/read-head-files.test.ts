import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunner } from '@noslop/runner';
import { createTestRepo } from '@noslop/testing';
import { readHeadFiles } from './read-head-files';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-read-head-files-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir, runner: createRunner() };
}

test('it reads every file at the head, in nested folders too', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'a.ts': 'export const a = 1;\n' } },
    { message: 'head', files: { 'src/client/picker.ts': 'export const picker = 1;\n' } },
  ]);

  const files = await readHeadFiles(
    {
      id: 'case-1',
      repo: repo.path,
      base: repo.commits[0] ?? '',
      head: repo.commits[1] ?? '',
      title: 'feat: head',
      body: '',
      findings: [],
      escapes: [],
    },
    ctx.runner,
  );

  expect(files).toIncludeSameMembers(['a.ts', 'src/client/picker.ts']);
});

test('it reads no files when the clone is missing', async () => {
  const ctx = await setupTest();

  const files = await readHeadFiles(
    {
      id: 'case-1',
      repo: join(ctx.dir, 'missing'),
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      title: 'feat: head',
      body: '',
      findings: [],
      escapes: [],
    },
    ctx.runner,
  );

  expect(files).toStrictEqual([]);
});

test('it reads no files when the clone lacks the head', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'a.ts': 'export const a = 1;\n' } },
  ]);

  const files = await readHeadFiles(
    {
      id: 'case-1',
      repo: repo.path,
      base: repo.commits[0] ?? '',
      head: 'f'.repeat(40),
      title: 'feat: head',
      body: '',
      findings: [],
      escapes: [],
    },
    ctx.runner,
  );

  expect(files).toStrictEqual([]);
});
