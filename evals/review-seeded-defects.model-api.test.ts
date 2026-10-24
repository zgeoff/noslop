import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Finding } from '@noslop/contract';
import { reviewResultSchema } from '@noslop/contract';
import { createRunner } from '@noslop/runner';
import { createTestRepo } from '@noslop/testing';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-e2e-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, runner: createRunner(), adapter: Bun.env['NOSLOP_MODEL_API_ADAPTER'] };
}

test('it reports a dropped rollback and an injection sink at anchors in the diff', async () => {
  const ctx = await setupTest();

  // the model-api lane fails when no adapter is named, so a run without one never passes unseen
  expect(ctx.adapter).toBeOneOf(['codex', 'claude']);

  const repo = await createTestRepo(join(ctx.directory, 'shop'), [
    {
      message: 'Add the stock and order queries',
      files: {
        'package.json': '{\n  "name": "shop",\n  "version": "1.0.0",\n  "private": true\n}\n',
        'src/stock.ts': [
          "import type { Database } from 'bun:sqlite';",
          '',
          '// moves stock between 2 SKUs in one transaction, so a failed update moves nothing',
          'export function moveStock(db: Database, from: string, to: string, count: number): void {',
          "  db.run('BEGIN');",
          '',
          '  try {',
          "    db.run('UPDATE stock SET count = count - ? WHERE sku = ?', [count, from]);",
          "    db.run('UPDATE stock SET count = count + ? WHERE sku = ?', [count, to]);",
          "    db.run('COMMIT');",
          '  } catch (error) {',
          "    db.run('ROLLBACK');",
          '    throw error;',
          '  }',
          '}',
          '',
        ].join('\n'),
        'src/orders.ts': [
          "import type { Database } from 'bun:sqlite';",
          '',
          'export function findOrders(db: Database, customer: string): unknown[] {',
          "  return db.query('SELECT * FROM orders WHERE customer = ?').all(customer);",
          '}',
          '',
        ].join('\n'),
      },
    },
    {
      message:
        'Log a failed stock move and filter orders by status\n\nThe status comes from the request query string.',
      files: {
        'src/stock.ts': [
          "import type { Database } from 'bun:sqlite';",
          '',
          '// moves stock between 2 SKUs in one transaction, so a failed update moves nothing',
          'export function moveStock(db: Database, from: string, to: string, count: number): void {',
          "  db.run('BEGIN');",
          '',
          '  try {',
          "    db.run('UPDATE stock SET count = count - ? WHERE sku = ?', [count, from]);",
          "    db.run('UPDATE stock SET count = count + ? WHERE sku = ?', [count, to]);",
          "    db.run('COMMIT');",
          '  } catch (error) {',
          "    console.warn('stock move failed', error);",
          '  }',
          '}',
          '',
        ].join('\n'),
        'src/orders.ts': [
          "import type { Database } from 'bun:sqlite';",
          '',
          'export function findOrders(db: Database, customer: string, status: string): unknown[] {',
          '  return db',
          // oxlint-disable-next-line no-template-curly-in-string -- the seeded source builds SQL in a template
          "    .query(`SELECT * FROM orders WHERE customer = ? AND status = '${status}'`)",
          '    .all(customer);',
          '}',
          '',
        ].join('\n'),
      },
    },
  ]);

  const result = await ctx.runner.run(
    [
      'bun',
      join(import.meta.dir, '..', 'apps', 'cli', 'src', 'cli.ts'),
      'review',
      '--base',
      repo.commits[0] ?? '',
      '--head',
      repo.commits[1] ?? '',
      '--adapter',
      ctx.adapter ?? '',
      '--json',
    ],
    {
      cwd: repo.path,
      env: { XDG_CACHE_HOME: join(ctx.directory, 'cache') },
      timeoutMs: 1_800_000,
    },
  );

  const review = reviewResultSchema.parse(JSON.parse(result.stdout));

  expect(result.exitCode).toBe(0);
  expect(review.failedCalls).toStrictEqual([]);

  expect(review.findings).toSatisfyAll(
    (finding: Finding) =>
      (finding.anchor.path === 'src/stock.ts' && finding.anchor.endLine <= 15) ||
      (finding.anchor.path === 'src/orders.ts' && finding.anchor.endLine <= 8),
  );

  expect(review.findings).toSatisfyAny(
    (finding: Finding) =>
      finding.anchor.path === 'src/stock.ts' &&
      finding.anchor.startLine <= 13 &&
      finding.anchor.endLine >= 11,
  );

  expect(review.findings).toSatisfyAny(
    (finding: Finding) =>
      finding.anchor.path === 'src/orders.ts' &&
      finding.anchor.startLine <= 6 &&
      finding.anchor.endLine >= 3,
  );
}, 1_800_000);
