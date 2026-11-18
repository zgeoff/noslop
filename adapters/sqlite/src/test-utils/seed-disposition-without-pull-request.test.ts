import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTempPrefix } from '@noslop/runner';
import { loadStore } from '../store/load-store';
import { seedDispositionWithoutPullRequest } from './seed-disposition-without-pull-request';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-store-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const store = await loadStore(join(directory, 'store.sqlite'));

  onTestFinished(() => store.destroy());

  return { store };
}

test('it writes a disposition row with no pull request', async () => {
  const ctx = await setupTest();

  await seedDispositionWithoutPullRequest(ctx.store, { finding_id: '1111111111111111' });

  const rows = await ctx.store.selectFrom('dispositions').selectAll().execute();

  expect(rows).toMatchObject([{ finding_id: '1111111111111111', pull_request: null }]);
});

test('it writes no pull request even when the input names one', async () => {
  const ctx = await setupTest();

  await seedDispositionWithoutPullRequest(ctx.store, { pull_request: 7 });

  const rows = await ctx.store.selectFrom('dispositions').select(['pull_request']).execute();

  expect(rows).toStrictEqual([{ pull_request: null }]);
});
