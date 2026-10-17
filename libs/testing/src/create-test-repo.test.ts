import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestRepo } from './create-test-repo';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-test-repo-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it creates one commit per entry and returns their shas in order', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'head', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  const log = await Bun.$`git -C ${repo.path} log --format=%H`.text();

  expect(log.trim().split('\n')).toStrictEqual([...repo.commits].toReversed());
});

test('it removes a file whose content is null', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'head', files: { 'src/a.ts': null } },
  ]);

  const files = await Bun.$`git -C ${repo.path} ls-files`.text();

  expect(files).toBe('');
});
