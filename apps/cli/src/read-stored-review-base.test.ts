import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadStore, writeReview } from '@noslop/sqlite';
import { buildMockReviewResult } from '@noslop/testing';
import { readStoredReviewBase } from './read-stored-review-base';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-stored-review-base-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, path: join(directory, 'store.sqlite') };
}

test('it reads the base of the first review of the pull request from the store', async () => {
  const ctx = await setupTest();
  const store = await loadStore(ctx.path);

  onTestFinished(() => store.destroy());

  await writeReview(
    store,
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 9 },
      base: 'c'.repeat(40),
    }),
  );

  const base = await readStoredReviewBase(ctx.path, 'example/app', 9);

  expect(base).toBe('c'.repeat(40));
});

test('it reads no base and makes no store when the user has none', async () => {
  const ctx = await setupTest();
  const base = await readStoredReviewBase(ctx.path, 'example/app', 9);
  const entries = await readdir(ctx.directory);

  expect(base).toBeNull();
  expect(entries).toStrictEqual([]);
});
