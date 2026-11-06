import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { loadStore, runStoreQuery, writeReview } from '@noslop/sqlite';
import { buildMockFinding, buildMockReviewResult, readTempPrefix } from '@noslop/testing';
import { makeDispositionRecorder } from './make-disposition-recorder';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-store-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, path: join(directory, 'store.sqlite'), logger: getLogger(['test']) };
}

test('it resolves without a disposition kept when the store cannot open', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'taken'), 'a file where the store folder would go\n');

  const record = makeDispositionRecorder(join(ctx.directory, 'taken', 'store.sqlite'), ctx.logger);

  await expect(
    record({ owner: 'example', repo: 'app', number: 7 }, [
      {
        findingID: '1111111111111111',
        kind: 'fixed',
        value: 'abc1234',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-03-02T10:00:00.000Z',
      },
    ]),
  ).toResolve();
});

test('it keeps each disposition in the store at its path for the findings-by-pr query', async () => {
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

  await makeDispositionRecorder(ctx.path, ctx.logger)(
    { owner: 'example', repo: 'app', number: 7 },
    [
      {
        findingID: '1111111111111111',
        kind: 'not-a-defect',
        value: 'the loop already stops at the end',
        author: 'dev',
        authorIsOwner: false,
        source: 'github',
        at: '2026-03-02T10:00:00.000Z',
      },
    ],
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
      dispositionKind: 'not-a-defect',
      dispositionValue: 'the loop already stops at the end',
      outcome: 'not-a-defect',
      commentURL: null,
    },
  ]);
});
