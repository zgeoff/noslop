import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadStore, writeReview } from '@noslop/sqlite';
import { buildMockReviewResult } from '@noslop/testing';
import { readStoredReviews } from './read-stored-reviews';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-stored-reviews-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, path: join(directory, 'store.sqlite') };
}

test('it reads the reviews of the pull request from the store', async () => {
  const ctx = await setupTest();
  const store = await loadStore(ctx.path);

  onTestFinished(() => store.destroy());

  await writeReview(
    store,
    buildMockReviewResult({
      pullRequest: { owner: 'example', repo: 'app', number: 9 },
      base: 'c'.repeat(40),
      head: 'd'.repeat(40),
    }),
  );

  const reviews = await readStoredReviews(ctx.path, 'example/app', 9);

  expect(reviews).toStrictEqual([
    { base: 'c'.repeat(40), head: 'd'.repeat(40), isLensReview: true },
  ]);
});

test('it reads no review and makes no store when the user has none', async () => {
  const ctx = await setupTest();
  const reviews = await readStoredReviews(ctx.path, 'example/app', 9);
  const entries = await readdir(ctx.directory);

  expect(reviews).toStrictEqual([]);
  expect(entries).toStrictEqual([]);
});
