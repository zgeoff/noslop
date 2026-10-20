import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadStore } from './load-store';
import { writeDispositions } from './write-dispositions';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-store-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const store = await loadStore(join(directory, 'store.sqlite'));

  onTestFinished(() => store.destroy());

  return { store };
}

test('it records a disposition read twice from one source once', async () => {
  const ctx = await setupTest();

  const disposition = {
    findingID: '1111111111111111',
    kind: 'deferred',
    value: '#123',
    author: 'dev',
    authorIsOwner: true,
    source: 'github',
    at: '2026-10-17T11:00:00.000Z',
  } as const;

  await writeDispositions(ctx.store, 'example/app', 7, [disposition]);
  await writeDispositions(ctx.store, 'example/app', 7, [disposition]);

  const rows = await ctx.store.selectFrom('dispositions').selectAll().execute();

  expect(rows).toStrictEqual([
    {
      repo: 'example/app',
      finding_id: '1111111111111111',
      kind: 'deferred',
      value: '#123',
      author: 'dev',
      author_is_owner: 1,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
      pull_request: 7,
    },
  ]);
});

test('it records one finding ID from 2 repos as 2 dispositions', async () => {
  const ctx = await setupTest();

  const disposition = {
    findingID: '1111111111111111',
    kind: 'deferred',
    value: '#123',
    author: 'dev',
    authorIsOwner: true,
    source: 'github',
    at: '2026-10-17T11:00:00.000Z',
  } as const;

  await writeDispositions(ctx.store, 'example/x', 7, [disposition]);
  await writeDispositions(ctx.store, 'example/y', 7, [disposition]);

  const rows = await ctx.store
    .selectFrom('dispositions')
    .select(['repo', 'finding_id'])
    .orderBy('repo')
    .execute();

  expect(rows).toStrictEqual([
    { repo: 'example/x', finding_id: '1111111111111111' },
    { repo: 'example/y', finding_id: '1111111111111111' },
  ]);
});
