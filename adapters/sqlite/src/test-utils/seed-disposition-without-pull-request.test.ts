import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTempPrefix } from '@noslop/testing';
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

  await seedDispositionWithoutPullRequest(ctx.store, 'example/app', {
    findingID: '1111111111111111',
    kind: 'deferred',
    value: '#123',
    author: 'dev',
    authorIsOwner: true,
    source: 'github',
    at: '2026-10-17T11:00:00.000Z',
  });

  const rows = await ctx.store.selectFrom('dispositions').selectAll().execute();

  expect(rows).toMatchObject([
    {
      repo: 'example/app',
      pull_request: null,
      finding_id: '1111111111111111',
      kind: 'deferred',
      value: '#123',
      author: 'dev',
      author_is_owner: 1,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
    },
  ]);
});
