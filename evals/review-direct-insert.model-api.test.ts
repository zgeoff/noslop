import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Finding } from '@noslop/contract';
import { reviewResultSchema } from '@noslop/contract';
import { createRunner } from '@noslop/runner';
import { createTestRepo, readTempPrefix } from '@noslop/testing';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `${readTempPrefix()}noslop-e2e-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, runner: createRunner(), adapter: Bun.env['NOSLOP_MODEL_API_ADAPTER'] };
}

test('it reports a row a test inserts outside a seed under the quoted seeding rule', async () => {
  const ctx = await setupTest();

  // the model-api lane fails when no adapter is named, so a run without one never passes unseen
  expect(ctx.adapter).toBeOneOf(['codex', 'claude']);

  const repo = await createTestRepo(join(ctx.directory, 'library'), [
    {
      message: 'Add the books module and the loans module',
      files: {
        'package.json': '{\n  "name": "library",\n  "version": "1.0.0",\n  "private": true\n}\n',
        'review.json': '{\n  "rules": "./rules.md"\n}\n',
        'rules.md': [
          '# Testing',
          '',
          '## Seeding',
          '',
          'A test outside the module that owns a table seeds its rows only through the seeds that module',
          'publishes in its `test-utils/` folder. Write a row directly only inside a seed, and name the',
          'state it makes in a `//` comment.',
          '',
        ].join('\n'),
        'src/books/open-books.ts': [
          "import type { Database } from 'bun:sqlite';",
          '',
          'export function openBooks(db: Database): void {',
          "  db.run('CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, title TEXT NOT NULL, lentTo TEXT)');",
          '}',
          '',
        ].join('\n'),
        'src/books/create-book.ts': [
          "import type { Database } from 'bun:sqlite';",
          '',
          'export function createBook(db: Database, id: string, title: string): void {',
          "  db.run('INSERT INTO books (id, title) VALUES (?, ?)', [id, title]);",
          '}',
          '',
        ].join('\n'),
        'src/books/test-utils/seed-book.ts': [
          "import type { Database } from 'bun:sqlite';",
          "import { createBook } from '../create-book';",
          '',
          'export function seedBook(db: Database, input: { id?: string; title?: string } = {}): void {',
          "  createBook(db, input.id ?? 'book-1', input.title ?? 'The Salt Road');",
          '}',
          '',
        ].join('\n'),
        'src/loans/lend-book.ts': [
          "import type { Database } from 'bun:sqlite';",
          '',
          'export function lendBook(db: Database, bookID: string, readerID: string): void {',
          "  db.run('UPDATE books SET lentTo = ? WHERE id = ?', [readerID, bookID]);",
          '}',
          '',
        ].join('\n'),
      },
    },
    {
      message: 'Test lending a book',
      files: {
        'src/loans/lend-book.test.ts': [
          "import { Database } from 'bun:sqlite';",
          "import { expect, test } from 'bun:test';",
          "import { openBooks } from '../books/open-books';",
          "import { lendBook } from './lend-book';",
          '',
          "test('it marks a book as lent to the reader', () => {",
          "  const db = new Database(':memory:');",
          '  openBooks(db);',
          "  db.run(\"INSERT INTO books (id, title) VALUES ('book-1', 'The Salt Road')\");",
          '',
          "  lendBook(db, 'book-1', 'reader-7');",
          '',
          "  expect(db.query('SELECT lentTo FROM books WHERE id = ?').get('book-1')).toStrictEqual({",
          "    lentTo: 'reader-7',",
          '  });',
          '});',
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
      timeoutMs: 90_000,
    },
  );

  const review = reviewResultSchema.parse(JSON.parse(result.stdout));

  expect(result.exitCode).toBe(0);
  expect(review.failedCalls).toStrictEqual([]);

  expect(review.findings).toSatisfyAny(
    (finding: Finding) =>
      finding.lens === 'tests' &&
      finding.rule === 'rules.md: Seeding' &&
      finding.anchor.path === 'src/loans/lend-book.test.ts' &&
      finding.anchor.startLine <= 9 &&
      finding.anchor.endLine >= 9,
  );
}, 100_000);
