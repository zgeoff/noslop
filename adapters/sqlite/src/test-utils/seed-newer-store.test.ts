import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTempPrefix } from '@noslop/testing';
import { z } from 'zod';
import { seedNewerStore } from './seed-newer-store';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-store-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { path: join(directory, 'store.sqlite') };
}

test('it records a migration later than every migration the store knows', async () => {
  const ctx = await setupTest();

  await seedNewerStore(ctx.path, {
    name: '9999-a-later-schema',
    timestamp: '2026-10-18T09:00:00.000Z',
  });

  const database = new Database(ctx.path, { strict: true, readonly: true });

  onTestFinished(() => {
    database.close();
  });

  const names = z
    .array(z.object({ name: z.string() }))
    .parse(database.query('SELECT name FROM kysely_migration ORDER BY name').all())
    .map((row) => row.name);

  expect(names.at(-1)).toBe('9999-a-later-schema');
});
