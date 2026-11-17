import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { loadStore, runStoreQuery, writeReview } from '@noslop/sqlite';
import { buildMockFinding, buildMockReviewResult, readTempPrefix } from '@noslop/testing';
import { makeCommentURLRecorder } from './make-comment-url-recorder';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-store-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, path: join(directory, 'store.sqlite'), logger: getLogger(['test']) };
}

test('it resolves without a link kept when the store cannot open', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'taken'), 'a file where the store folder would go\n');

  const record = makeCommentURLRecorder(join(ctx.directory, 'taken', 'store.sqlite'), ctx.logger);

  await expect(
    record(
      { owner: 'example', repo: 'app', number: 7 },
      new Map([['1111111111111111', 'https://github.com/example/app/pull/7#discussion_r101']]),
    ),
  ).toResolve();
});

test('it keeps each comment link in the store at its path for the findings-by-pr query', async () => {
  const ctx = await setupTest();
  const store = await loadStore(ctx.path);

  onTestFinished(() => store.destroy());

  await writeReview(
    store,
    buildMockReviewResult({
      reviewID: 'review-1',
      head: '7c3e9a1f0b2d4c6e8a0f1b3d5e7c9a2b4d6f8e0a',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      findings: [
        buildMockFinding({
          id: '1111111111111111',
          lens: 'correctness',
          title: 'Return the total of every item',
          severity: 'P2',
          anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
        }),
      ],
    }),
  );

  await makeCommentURLRecorder(ctx.path, ctx.logger)(
    { owner: 'example', repo: 'app', number: 7 },
    new Map([['1111111111111111', 'https://github.com/example/app/pull/7#discussion_r101']]),
  );

  const rows = await runStoreQuery(store, 'findings-by-pr');

  expect(rows).toStrictEqual([
    {
      repo: 'example/app',
      pullRequest: 7,
      head: '7c3e9a1f0b2d4c6e8a0f1b3d5e7c9a2b4d6f8e0a',
      id: '1111111111111111',
      path: 'src/a.ts',
      startLine: 1,
      severity: 'P2',
      lens: 'correctness',
      rule: null,
      title: 'Return the total of every item',
      dispositionKind: null,
      dispositionValue: null,
      outcome: 'open',
      commentURL: 'https://github.com/example/app/pull/7#discussion_r101',
    },
  ]);
});
