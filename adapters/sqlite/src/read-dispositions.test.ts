import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTempPrefix } from '@noslop/testing';
import { loadStore } from './load-store';
import { readDispositions } from './read-dispositions';
import { writeDispositions } from './write-dispositions';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-store-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const store = await loadStore(join(directory, 'store.sqlite'));

  onTestFinished(() => store.destroy());

  return { store };
}

test('it reads the dispositions of one pull request of a repo in the order they were given', async () => {
  const ctx = await setupTest();

  await writeDispositions(ctx.store, 'example/app', 7, [
    {
      findingID: '2222222222222222',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T12:00:00.000Z',
    },
    {
      findingID: '1111111111111111',
      kind: 'deferred',
      value: '#123',
      author: 'lead',
      authorIsOwner: true,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
    },
  ]);

  await writeDispositions(ctx.store, 'example/app', 8, [
    {
      findingID: '3333333333333333',
      kind: 'not-a-defect',
      value: 'the caller holds the lock',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T11:30:00.000Z',
    },
  ]);

  await writeDispositions(ctx.store, 'example/web', 7, [
    {
      findingID: '4444444444444444',
      kind: 'fixed',
      value: '5d6e7f8',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T11:30:00.000Z',
    },
  ]);

  const dispositions = await readDispositions(ctx.store, 'example/app', 7);

  expect(dispositions).toStrictEqual([
    {
      findingID: '1111111111111111',
      kind: 'deferred',
      value: '#123',
      author: 'lead',
      authorIsOwner: true,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
    },
    {
      findingID: '2222222222222222',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T12:00:00.000Z',
    },
  ]);
});

test('it orders dispositions given at one time by finding, then by source', async () => {
  const ctx = await setupTest();

  await writeDispositions(ctx.store, 'example/app', 7, [
    {
      findingID: '2222222222222222',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
    },
    {
      findingID: '1111111111111111',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
    },
    {
      findingID: '1111111111111111',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'eval',
      at: '2026-10-17T11:00:00.000Z',
    },
  ]);

  const dispositions = await readDispositions(ctx.store, 'example/app', 7);

  expect(dispositions).toStrictEqual([
    {
      findingID: '1111111111111111',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'eval',
      at: '2026-10-17T11:00:00.000Z',
    },
    {
      findingID: '1111111111111111',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
    },
    {
      findingID: '2222222222222222',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      authorIsOwner: false,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
    },
  ]);
});

test('it leaves out a disposition recorded with no pull request', async () => {
  const ctx = await setupTest();

  await ctx.store
    .insertInto('dispositions')
    .values({
      repo: 'example/app',
      pull_request: null,
      finding_id: '1111111111111111',
      kind: 'fixed',
      value: '1a2b3c4',
      author: 'dev',
      author_is_owner: 0,
      source: 'github',
      at: '2026-10-17T11:00:00.000Z',
    })
    .execute();

  const dispositions = await readDispositions(ctx.store, 'example/app', 7);

  expect(dispositions).toStrictEqual([]);
});

test('it reads no dispositions of a pull request with none', async () => {
  const ctx = await setupTest();
  const dispositions = await readDispositions(ctx.store, 'example/app', 7);

  expect(dispositions).toStrictEqual([]);
});
