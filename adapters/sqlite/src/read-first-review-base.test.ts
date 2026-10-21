import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockReviewResult } from '@noslop/testing';
import { loadStore } from './load-store';
import { readFirstReviewBase } from './read-first-review-base';
import { writeReview } from './write-review';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-store-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const store = await loadStore(join(directory, 'store.sqlite'));

  onTestFinished(() => store.destroy());

  return { store };
}

test('it reads the base of the earliest review of the pull request', async () => {
  const ctx = await setupTest();

  for (const review of [
    {
      reviewID: 'review-later',
      base: 'c'.repeat(40),
      startedAt: '2026-10-17T11:00:00.000Z',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
    },
    {
      reviewID: 'review-first',
      base: 'a'.repeat(40),
      startedAt: '2026-10-17T10:00:00.000Z',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
    },
    {
      reviewID: 'review-other-pull-request',
      base: 'd'.repeat(40),
      startedAt: '2026-10-17T09:00:00.000Z',
      pullRequest: { owner: 'example', repo: 'app', number: 8 },
    },
    {
      reviewID: 'review-other-repo',
      repo: 'example/web',
      base: 'e'.repeat(40),
      startedAt: '2026-10-17T09:00:00.000Z',
      pullRequest: { owner: 'example', repo: 'web', number: 7 },
    },
  ]) {
    await writeReview(ctx.store, buildMockReviewResult(review));
  }

  const base = await readFirstReviewBase(ctx.store, 'example/app', 7);

  expect(base).toBe('a'.repeat(40));
});

test('it reads no base for a pull request the store holds no review of', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({ pullRequest: { owner: 'example', repo: 'app', number: 8 } }),
  );

  const base = await readFirstReviewBase(ctx.store, 'example/app', 7);

  expect(base).toBeNull();
});
