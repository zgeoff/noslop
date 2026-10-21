import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
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

  const reviews = await readStoredReviews(
    { probeFile: () => Promise.resolve(true), loadStore: (path) => loadStore(path) },
    ctx.path,
    'example/app',
    9,
  );

  expect(reviews).toStrictEqual([
    { base: 'c'.repeat(40), head: 'd'.repeat(40), isLensReview: true },
  ]);
});

test('it reads no review and loads no store when the user has none', async () => {
  const ctx = await setupTest();

  const load = mock(loadStore);

  const reviews = await readStoredReviews(
    { probeFile: () => Promise.resolve(false), loadStore: load },
    ctx.path,
    'example/app',
    9,
  );

  expect(reviews).toStrictEqual([]);
  expect(load).not.toHaveBeenCalled();
});
