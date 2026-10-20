import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockFinding, buildMockReviewResult } from '@noslop/testing';
import { loadStore } from './load-store';
import { updateCommentURLs } from './update-comment-urls';
import { writeReview } from './write-review';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-store-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const store = await loadStore(join(directory, 'store.sqlite'));

  onTestFinished(() => store.destroy());

  return { store };
}

test('it links the finding in every review of its pull request and in no other pull request', async () => {
  const ctx = await setupTest();

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-1',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      endedAt: '2026-10-17T10:01:00.000Z',
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-2',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      endedAt: '2026-10-17T12:01:00.000Z',
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await writeReview(
    ctx.store,
    buildMockReviewResult({
      reviewID: 'review-other-pr',
      pullRequest: { owner: 'example', repo: 'app', number: 8 },
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await updateCommentURLs(
    ctx.store,
    'example/app',
    7,
    new Map([['1111111111111111', 'https://github.com/example/app/pull/7#discussion_r101']]),
  );

  const rows = await ctx.store
    .selectFrom('findings')
    .select(['review_id', 'comment_url'])
    .orderBy('review_id')
    .execute();

  expect(rows).toStrictEqual([
    { review_id: 'review-1', comment_url: 'https://github.com/example/app/pull/7#discussion_r101' },
    { review_id: 'review-2', comment_url: 'https://github.com/example/app/pull/7#discussion_r101' },
    { review_id: 'review-other-pr', comment_url: null },
  ]);
});
