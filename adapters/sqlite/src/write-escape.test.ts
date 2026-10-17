import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadStore } from './load-store';
import { writeEscape } from './write-escape';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-store-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const store = await loadStore(join(dir, 'store.sqlite'));

  onTestFinished(() => store.destroy());

  return { store };
}

test('it records an escape under a new id', async () => {
  const ctx = await setupTest();

  const escapeID = await writeEscape(ctx.store, {
    repo: 'example/app',
    issue: '#12',
    head: 'b'.repeat(40),
    lens: 'correctness',
    defect: 'The total skips the first item',
    path: 'src/a.ts',
    startLine: 4,
    endLine: 4,
    recordedAt: '2026-10-18T00:00:00.000Z',
  });

  const rows = await ctx.store.selectFrom('escapes').selectAll().execute();

  expect(rows).toStrictEqual([
    {
      escape_id: escapeID,
      repo: 'example/app',
      issue: '#12',
      head: 'b'.repeat(40),
      lens: 'correctness',
      defect: 'The total skips the first item',
      path: 'src/a.ts',
      start_line: 4,
      end_line: 4,
      recorded_at: '2026-10-18T00:00:00.000Z',
    },
  ]);
});
