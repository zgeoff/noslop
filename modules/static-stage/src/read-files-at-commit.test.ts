import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunner } from '@noslop/runner';
import { createTestRepo } from '@noslop/testing';
import { readFilesAtCommit } from './read-files-at-commit';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-cat-file-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, runner: createRunner() };
}

test('it reads each file at the commit and leaves out a path the commit lacks', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/a.ts': 'export const a = 1;\n\n', 'src/é b.ts': 'export const b = "é";\n' },
    },
  ]);

  const files = await readFilesAtCommit(ctx.runner, repo.path, repo.commits[0] ?? '', [
    'src/a.ts',
    'src/é b.ts',
    'src/missing.ts',
  ]);

  expect([...files]).toStrictEqual([
    ['src/a.ts', 'export const a = 1;\n\n'],
    ['src/é b.ts', 'export const b = "é";\n'],
  ]);
});
