import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockFinding, buildMockReviewResult } from '@noslop/testing';
import { z } from 'zod';
import { loadStore } from './load-store';
import { writeReview } from './write-review';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-store-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { path: join(directory, 'store.sqlite') };
}

test('it keys each disposition a store held before on the one repo whose reviews report its finding', async () => {
  const ctx = await setupTest();
  const first = await loadStore(ctx.path);

  await writeReview(
    first,
    buildMockReviewResult({
      reviewID: 'review-app',
      repo: 'example/app',
      findings: [
        buildMockFinding({ id: '1111111111111111' }),
        buildMockFinding({
          id: '3333333333333333',
          anchor: { path: 'src/b.ts', startLine: 2, endLine: 2 },
        }),
      ],
    }),
  );

  await writeReview(
    first,
    buildMockReviewResult({
      reviewID: 'review-web',
      repo: 'example/web',
      findings: [buildMockFinding({ id: '3333333333333333' })],
    }),
  );

  await first.destroy();

  const database = new Database(ctx.path, { strict: true });

  database.run(`DELETE FROM kysely_migration WHERE name >= '0002'`);
  database.run('ALTER TABLE reviews ADD COLUMN stepped_up_from text');
  database.run('ALTER TABLE calls ADD COLUMN chunk integer');
  database.run('ALTER TABLE calls DROP COLUMN cached_input_tokens');
  database.run('ALTER TABLE calls DROP COLUMN cache_write_tokens');
  database.run('ALTER TABLE findings DROP COLUMN comment_url');
  database.run('DROP TABLE dispositions');
  database.run('DROP TABLE dropped_findings');

  database.run(`CREATE TABLE dispositions (finding_id text NOT NULL, kind text NOT NULL,
    value text NOT NULL, author text NOT NULL, author_is_owner integer NOT NULL,
    source text NOT NULL, at text NOT NULL,
    CONSTRAINT dispositions_pk PRIMARY KEY (finding_id, source, at))`);

  database.run(`INSERT INTO dispositions VALUES
    ('1111111111111111', 'deferred', '#123', 'dev', 1, 'github', '2026-10-17T11:00:00.000Z'),
    ('2222222222222222', 'deferred', '#124', 'dev', 1, 'github', '2026-10-17T11:00:00.000Z'),
    ('3333333333333333', 'deferred', '#125', 'dev', 1, 'github', '2026-10-17T11:00:00.000Z')`);

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
    { repo: '', finding_id: '3333333333333333' },
  ]);
});

test('it gives a call the store held before no cache counts', async () => {
  const ctx = await setupTest();
  const first = await loadStore(ctx.path);

  await writeReview(first, buildMockReviewResult({ reviewID: 'review-app' }));

  await first.destroy();

  const database = new Database(ctx.path, { strict: true });

  database.run(`DELETE FROM kysely_migration WHERE name >= '0004'`);
  database.run('ALTER TABLE reviews ADD COLUMN stepped_up_from text');
  database.run('ALTER TABLE calls DROP COLUMN cached_input_tokens');
  database.run('ALTER TABLE calls DROP COLUMN cache_write_tokens');
  database.run('ALTER TABLE findings DROP COLUMN comment_url');
  database.run('DROP TABLE dropped_findings');
  database.close();

  const store = await loadStore(ctx.path);

  onTestFinished(() => store.destroy());

  const rows = await store
    .selectFrom('calls')
    .select(['input_tokens', 'cached_input_tokens', 'cache_write_tokens'])
    .execute();

  expect(rows).toStrictEqual([
    { input_tokens: 100, cached_input_tokens: 0, cache_write_tokens: 0 },
  ]);
});

test('it gives a disposition the store held before no pull request', async () => {
  const ctx = await setupTest();
  const first = await loadStore(ctx.path);

  await first.destroy();

  const database = new Database(ctx.path, { strict: true });

  database.run(`DELETE FROM kysely_migration WHERE name >= '0007'`);
  database.run('ALTER TABLE findings DROP COLUMN comment_url');
  database.run('DROP TABLE dispositions');

  database.run(`CREATE TABLE dispositions (repo text NOT NULL, finding_id text NOT NULL,
    kind text NOT NULL, value text NOT NULL, author text NOT NULL,
    author_is_owner integer NOT NULL, source text NOT NULL, at text NOT NULL,
    CONSTRAINT dispositions_pk PRIMARY KEY (repo, finding_id, source, at))`);

  database.run(`INSERT INTO dispositions VALUES
    ('example/app', '1111111111111111', 'deferred', '#123', 'dev', 1, 'github',
      '2026-10-17T11:00:00.000Z')`);

  database.close();

  const store = await loadStore(ctx.path);

  onTestFinished(() => store.destroy());

  const rows = await store
    .selectFrom('dispositions')
    .select(['finding_id', 'pull_request'])
    .execute();

  expect(rows).toStrictEqual([{ finding_id: '1111111111111111', pull_request: null }]);
});

test('it opens a store written before findings kept a comment link and gives its findings none', async () => {
  const ctx = await setupTest();
  const first = await loadStore(ctx.path);

  await writeReview(
    first,
    buildMockReviewResult({
      reviewID: 'review-1',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await first.destroy();

  const database = new Database(ctx.path, { strict: true });

  database.run(`DELETE FROM kysely_migration WHERE name >= '0008'`);
  database.run('ALTER TABLE findings DROP COLUMN comment_url');
  database.close();

  const store = await loadStore(ctx.path);

  onTestFinished(() => store.destroy());

  const rows = await store.selectFrom('findings').select(['finding_id', 'comment_url']).execute();

  expect(rows).toStrictEqual([{ finding_id: '1111111111111111', comment_url: null }]);
});

test('it refuses a store migrated past the newest migration it knows and leaves the store as it was', async () => {
  const ctx = await setupTest();
  const first = await loadStore(ctx.path);

  await first.destroy();

  const database = new Database(ctx.path, { strict: true });

  database.run(
    `INSERT INTO kysely_migration (name, timestamp) VALUES ('9999-a-later-schema', '2026-10-18T09:00:00.000Z')`,
  );

  database.close();

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

test('it keeps one row of a disposition with no pull request written twice', async () => {
  const ctx = await setupTest();
  const store = await loadStore(ctx.path);

  onTestFinished(() => store.destroy());

  const row = {
    repo: 'example/app',
    pull_request: null,
    finding_id: '1111111111111111',
    kind: 'deferred',
    value: '#123',
    author: 'dev',
    author_is_owner: 1,
    source: 'github',
    at: '2026-10-17T11:00:00.000Z',
  };

  await store.insertInto('dispositions').values(row).execute();

  await store
    .insertInto('dispositions')
    .values(row)
    .onConflict((conflict) => conflict.doNothing())
    .execute();

  const rows = await store.selectFrom('dispositions').select(['finding_id']).execute();

  expect(rows).toStrictEqual([{ finding_id: '1111111111111111' }]);
});
