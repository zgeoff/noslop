import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureSync, getLogger, resetSync } from '@logtape/logtape';
import { loadStore, writeReview } from '@noslop/sqlite';
import { buildMockFinding, buildMockReviewResult, readTempPrefix } from '@noslop/testing';
import { makeRecordedFindingReader } from './make-recorded-finding-reader';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-store-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const warnings: string[] = [];

  configureSync({
    sinks: {
      buffer: (record) => {
        warnings.push(record.message.join(''));
      },
    },
    loggers: [
      { category: ['logtape', 'meta'], lowestLevel: 'error', sinks: [] },
      { category: ['test'], lowestLevel: 'warning', sinks: ['buffer'] },
    ],
  });

  onTestFinished(() => {
    resetSync();
  });

  return {
    directory,
    path: join(directory, 'store.sqlite'),
    logger: getLogger(['test']),
    warnings,
  };
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

test('it warns with the count of recorded findings that break the finding contract and reads the rest', async () => {
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
        buildMockFinding({ id: '1111111111111111' }),
        buildMockFinding({ id: '2222222222222222' }),
      ],
    }),
  );

  await store
    .updateTable('findings')
    .set({ severity: 'P1' })
    .where('finding_id', '=', '1111111111111111')
    .execute();

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
      id: '2222222222222222',
      anchorCommit: '7c3e9a1f0b2d4c6e8a0f1b3d5e7c9a2b4d6f8e0a',
    }),
  ]);

  expect(ctx.warnings).toStrictEqual([
    'recorded findings of 7 that break the finding contract, so the review posts none of them: 1',
  ]);
});
