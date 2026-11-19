import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockFinding } from '@noslop/contract/test-utils/build-mock-finding';
import { readTempPrefix } from '@noslop/runner';
import { readRecordedFindings } from '../reviews/read-recorded-findings';
import { loadStore } from '../store/load-store';
import { seedUnreadableFinding } from './seed-unreadable-finding';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-store-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const store = await loadStore(join(directory, 'store.sqlite'));

  onTestFinished(() => store.destroy());

  return { store };
}

test('it writes the findings of the review with a P1 severity', async () => {
  const ctx = await setupTest();

  await seedUnreadableFinding(ctx.store, {
    reviewID: 'review-1',
    findings: [buildMockFinding({ id: '1111111111111111', criterion: 'untested-change' })],
  });

  const rows = await ctx.store.selectFrom('findings').selectAll().execute();

  expect(rows).toMatchObject([
    { review_id: 'review-1', finding_id: '1111111111111111', severity: 'P1' },
  ]);
});

test('it writes a finding that the recorded-findings read counts as unreadable', async () => {
  const ctx = await setupTest();

  await seedUnreadableFinding(ctx.store, {
    pullRequest: { owner: 'example', repo: 'app', number: 7 },
    findings: [buildMockFinding({ criterion: 'untested-change' })],
  });

  expect(readRecordedFindings(ctx.store, 'example/app', 7)).resolves.toStrictEqual({
    findings: [],
    unreadable: 1,
  });
});

test('it refuses a finding whose criterion already sets P1', async () => {
  const ctx = await setupTest();

  expect(
    seedUnreadableFinding(ctx.store, {
      findings: [buildMockFinding({ criterion: 'data-loss', severity: 'P1' })],
    }),
  ).rejects.toThrowWithMessage(Error, /criterion sets P2 or P3/u);
});
