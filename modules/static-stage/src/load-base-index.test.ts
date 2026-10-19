import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILT_IN_DEFAULTS } from '@noslop/config';
import { createRunner } from '@noslop/runner';
import { createTestRepo } from '@noslop/testing';
import { loadBaseIndex } from './load-base-index';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-base-index-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, cacheDir: join(directory, 'cache'), runner: createRunner() };
}

test('it gives 2 loads of one base at once the same index and leaves one cache file', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/total.ts': 'export function total(items: number[]): number {\n  return 0;\n}\n',
      },
    },
  ]);

  const options = {
    runner: ctx.runner,
    repoDir: repo.path,
    base: repo.commits[0] ?? '',
    config: BUILT_IN_DEFAULTS,
    cacheDir: ctx.cacheDir,
  };

  const [first, second] = await Promise.all([loadBaseIndex(options), loadBaseIndex(options)]);
  const files = await readdir(ctx.cacheDir);

  expect(first).toStrictEqual([
    {
      name: 'total',
      location: { path: 'src/total.ts', startLine: 1, endLine: 3 },
      fingerprint: [],
    },
  ]);

  expect(second).toStrictEqual(first);
  expect(files).toSatisfyAll((file: string) => /^base-index-[0-9a-f]{24}\.json$/u.test(file));
  expect(files).toHaveLength(1);
});
