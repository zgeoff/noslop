import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTempPrefix } from '@noslop/testing';
import { z } from 'zod';
import { seedNewerStore } from '../test-utils/seed-newer-store';
import { loadStore } from './load-store';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-store-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { path: join(directory, 'store.sqlite') };
}

test('it refuses a store migrated past the newest migration it knows and leaves the store as it was', async () => {
  const ctx = await setupTest();

  await seedNewerStore(ctx.path);

  expect(loadStore(ctx.path, { version: '0.4.6' })).rejects.toThrowWithMessage(
    Error,
    /^the store schema 9999-a-later-schema is newer than this noslop \(0\.4\.6\), whose newest migration is \d{4}-[a-z-]+; update the pin$/u,
  );

  const reopened = new Database(ctx.path, { strict: true, readonly: true });

  onTestFinished(() => {
    reopened.close();
  });

  const names = z
    .array(z.object({ name: z.string() }))
    .parse(reopened.query('SELECT name FROM kysely_migration ORDER BY name').all())
    .map((row) => row.name);

  expect(names.at(-1)).toBe('9999-a-later-schema');
});
