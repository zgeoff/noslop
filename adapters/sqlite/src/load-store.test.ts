import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockFinding, buildMockReviewResult } from '@noslop/testing';
import { loadStore } from './load-store';
import { writeReview } from './write-review';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-store-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { path: join(dir, 'store.sqlite') };
}

test('it keys each disposition a store held before on the repo of a review of its finding', async () => {
  const ctx = await setupTest();
  const first = await loadStore(ctx.path);

  await writeReview(
    first,
    buildMockReviewResult({
      repo: 'example/app',
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await first.destroy();

  const database = new Database(ctx.path, { strict: true });

  database.run(`DELETE FROM kysely_migration WHERE name = '0002-dispositions-by-repo'`);
  database.run('DROP TABLE dispositions');

  database.run(`CREATE TABLE dispositions (finding_id text NOT NULL, kind text NOT NULL,
    value text NOT NULL, author text NOT NULL, author_is_owner integer NOT NULL,
    source text NOT NULL, at text NOT NULL,
    CONSTRAINT dispositions_pk PRIMARY KEY (finding_id, source, at))`);

  database.run(`INSERT INTO dispositions VALUES
    ('1111111111111111', 'deferred', '#123', 'dev', 1, 'github', '2026-10-17T11:00:00.000Z'),
    ('2222222222222222', 'deferred', '#124', 'dev', 1, 'github', '2026-10-17T11:00:00.000Z')`);

  database.close();

  const store = await loadStore(ctx.path);

  onTestFinished(() => store.destroy());

  const rows = await store
    .selectFrom('dispositions')
    .select(['repo', 'finding_id'])
    .orderBy('finding_id')
    .execute();

  expect(rows).toStrictEqual([
    { repo: 'example/app', finding_id: '1111111111111111' },
    { repo: '', finding_id: '2222222222222222' },
  ]);
});
