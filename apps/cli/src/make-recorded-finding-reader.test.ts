import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { loadStore, writeReview } from '@noslop/sqlite';
import { buildMockFinding, buildMockReviewResult, readTempPrefix } from '@noslop/testing';
import { makeRecordedFindingReader } from './make-recorded-finding-reader';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-store-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, path: join(directory, 'store.sqlite'), logger: getLogger(['test']) };
}

test('it reads no recorded finding when the store cannot open', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'taken'), 'a file where the store folder would go\n');

  const read = makeRecordedFindingReader(join(ctx.directory, 'taken', 'store.sqlite'), ctx.logger);

  expect(read({ owner: 'example', repo: 'app', number: 7 })).resolves.toStrictEqual([]);
});

test('it reads the recorded findings of the pull request from the store at its path', async () => {
  const ctx = await setupTest();
  const store = await loadStore(ctx.path);

  onTestFinished(() => store.destroy());

  await writeReview(
    store,
    buildMockReviewResult({
      reviewID: 'review-1',
      head: '7c3e9a1f0b2d4c6e8a0f1b3d5e7c9a2b4d6f8e0a',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  const findings = await makeRecordedFindingReader(
    ctx.path,
    ctx.logger,
  )({
    owner: 'example',
    repo: 'app',
    number: 7,
  });

  expect(findings).toStrictEqual([
    buildMockFinding({
      id: '1111111111111111',
      anchorCommit: '7c3e9a1f0b2d4c6e8a0f1b3d5e7c9a2b4d6f8e0a',
    }),
  ]);
});
