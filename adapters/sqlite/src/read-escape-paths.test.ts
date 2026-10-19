import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadStore } from './load-store';
import { readEscapePaths } from './read-escape-paths';
import { writeEscape } from './write-escape';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-store-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const store = await loadStore(join(directory, 'store.sqlite'));

  onTestFinished(() => store.destroy());

  return { store };
}

test('it reads each escaped file of the repo once, and skips escapes with no file', async () => {
  const ctx = await setupTest();

  for (const escape of [
    { repo: 'example/app', path: 'src/b.ts' },
    { repo: 'example/app', path: 'src/a.ts' },
    { repo: 'example/app', path: 'src/a.ts' },
    { repo: 'example/app', path: null },
    { repo: 'example/web', path: 'src/c.ts' },
  ]) {
    await writeEscape(ctx.store, {
      issue: '#12',
      head: 'b'.repeat(40),
      lens: null,
      defect: 'The total skips the first item',
      startLine: null,
      endLine: null,
      recordedAt: '2026-10-18T00:00:00.000Z',
      ...escape,
    });
  }

  const paths = await readEscapePaths(ctx.store, 'example/app');

  expect(paths).toStrictEqual(['src/a.ts', 'src/b.ts']);
});
