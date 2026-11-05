import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { loadStore, runStoreQuery, writeReview } from '@noslop/sqlite';
import { buildMockFinding, buildMockReviewResult } from '@noslop/testing';
import { makeDispositionRecorder } from './make-disposition-recorder';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-store-'));

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
  const before = await loadStore(ctx.path);

  await writeReview(
    before,
    buildMockReviewResult({
      reviewID: 'review-1',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await before.destroy();

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

  const store = await loadStore(ctx.path);

  onTestFinished(() => store.destroy());

  const rows = await runStoreQuery(store, 'findings-by-pr');

  expect(rows).toMatchObject([
    {
      id: '1111111111111111',
      dispositionKind: 'not-a-defect',
      dispositionValue: 'the loop already stops at the end',
      outcome: 'not-a-defect',
    },
  ]);
});
