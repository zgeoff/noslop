import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockFinding, readTempPrefix } from '@noslop/testing';
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
    findings: [buildMockFinding({ id: '1111111111111111', severity: 'P3' })],
  });

  const rows = await ctx.store.selectFrom('findings').selectAll().execute();

  expect(rows).toMatchObject([
    { review_id: 'review-1', finding_id: '1111111111111111', severity: 'P1' },
  ]);
});
