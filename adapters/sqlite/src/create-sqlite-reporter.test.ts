import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { buildMockFinding, buildMockReviewResult } from '@noslop/testing';
import { createSQLiteReporter } from './create-sqlite-reporter';
import { loadStore } from './load-store';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-store-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it records a review with its calls and findings in the file its options name', async () => {
  const ctx = await setupTest();

  const reporter = createSQLiteReporter(join(ctx.directory, 'default.sqlite'));

  await reporter.report(
    buildMockReviewResult({ findings: [buildMockFinding({ id: '1111111111111111' })] }),
    {
      logger: getLogger(['test']),
      options: { path: join(ctx.directory, 'nested', 'store.sqlite') },
      failedReporters: [],
    },
  );

  const store = await loadStore(join(ctx.directory, 'nested', 'store.sqlite'));

  onTestFinished(() => store.destroy());

  const finding = await store
    .selectFrom('findings')
    .select(['finding_id', 'depth', 'effort', 'written_by_change'])
    .executeTakeFirstOrThrow();

  const calls = await store
    .selectFrom('calls')
    .select(['call_id', 'input_tokens', 'cached_input_tokens', 'cache_write_tokens'])
    .execute();

  expect(finding).toStrictEqual({
    finding_id: '1111111111111111',
    depth: 'light',
    effort: 'low',
    written_by_change: 1,
  });

  expect(calls).toStrictEqual([
    { call_id: 'light', input_tokens: 100, cached_input_tokens: 400, cache_write_tokens: 20 },
  ]);
});

test('it keeps the first review when a second write of the same review fails', async () => {
  const ctx = await setupTest();

  const reporter = createSQLiteReporter(join(ctx.directory, 'store.sqlite'));
  const context = { logger: getLogger(['test']), options: {}, failedReporters: [] };

  await reporter.report(buildMockReviewResult(), context);

  const again = buildMockReviewResult({ findings: [buildMockFinding({ id: '2222222222222222' })] });

  expect(reporter.report(again, context)).rejects.toThrow();

  const store = await loadStore(join(ctx.directory, 'store.sqlite'));

  onTestFinished(() => store.destroy());

  const findings = await store.selectFrom('findings').select('finding_id').execute();

  expect(findings).toStrictEqual([]);
});
