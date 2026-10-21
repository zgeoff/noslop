import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockReviewResult } from '@noslop/testing';
import { loadStore } from './load-store';
import { readPullRequestReviews } from './read-pull-request-reviews';
import { writeReview } from './write-review';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-store-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const store = await loadStore(join(directory, 'store.sqlite'));

  onTestFinished(() => store.destroy());

  return { store };
}

test('it reads the reviews of the pull request newest first, and marks a run with no lens', async () => {
  const ctx = await setupTest();

  for (const review of [
    {
      reviewID: 'review-lens',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      startedAt: '2026-10-17T10:00:00.000Z',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
    },
    {
      reviewID: 'review-fixes-only',
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      lenses: [],
      startedAt: '2026-10-17T11:00:00.000Z',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
    },
    {
      reviewID: 'review-other-pull-request',
      base: 'd'.repeat(40),
      startedAt: '2026-10-17T12:00:00.000Z',
      pullRequest: { owner: 'example', repo: 'app', number: 8 },
    },
    {
      reviewID: 'review-other-repo',
      repo: 'example/web',
      base: 'e'.repeat(40),
      startedAt: '2026-10-17T12:00:00.000Z',
      pullRequest: { owner: 'example', repo: 'web', number: 7 },
    },
  ]) {
    await writeReview(ctx.store, buildMockReviewResult(review));
  }

  const reviews = await readPullRequestReviews(ctx.store, 'example/app', 7);

  expect(reviews).toStrictEqual([
    { base: 'b'.repeat(40), head: 'c'.repeat(40), isLensReview: false },
    { base: 'a'.repeat(40), head: 'b'.repeat(40), isLensReview: true },
  ]);
});
