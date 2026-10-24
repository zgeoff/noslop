import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILT_IN_DEFAULTS } from '@noslop/config';
import { createRunner } from '@noslop/runner';
import { createTestRepo } from '@noslop/testing';
import { readChange } from './read-change';
import { runStaticStage } from './run-static-stage';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-static-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const runner = createRunner();

  const saveWithRollback = [
    'export function save(db: Db) {',
    '  try {',
    "    db.run('BEGIN');",
    '  } catch (error) {',
    "    db.run('ROLLBACK');",
    '    throw error;',
    '  }',
    '}',
    '',
  ].join('\n');

  const sliceThrows = async (base: string, head: string) => {
    const repo = await createTestRepo(join(directory, 'repo'), [
      { message: 'base', files: { 'src/save.ts': base } },
      { message: 'head', files: { 'src/save.ts': head } },
    ]);

    const config = BUILT_IN_DEFAULTS;

    const change = await readChange({
      runner,
      repoDir: repo.path,
      base: 'HEAD~1',
      head: 'HEAD',
      config,
    });

    const result = await runStaticStage({
      runner,
      repoDir: repo.path,
      change,
      config,
      title: 'fix: change save',
      body: '',
      linkedIssue: null,
      cacheDir: null,
      pastEscapes: [],
    });

    return result.slices.throws.map((entry) => [entry.kind, entry.location.startLine]);
  };

  return { saveWithRollback, sliceThrows };
}

test('it keeps a catch whose body loses its rollback and rethrow', async () => {
  const ctx = await setupTest();

  const throws = await ctx.sliceThrows(
    ctx.saveWithRollback,
    [
      'export function save(db: Db) {',
      '  try {',
      "    db.run('BEGIN');",
      '  } catch (error) {',
      "    console.warn('save failed');",
      '  }',
      '}',
      '',
    ].join('\n'),
  );

  expect(throws).toStrictEqual([['catch', 4]]);
});

test('it keeps a catch whose body only loses lines', async () => {
  const ctx = await setupTest();

  const throws = await ctx.sliceThrows(
    ctx.saveWithRollback,
    [
      'export function save(db: Db) {',
      '  try {',
      "    db.run('BEGIN');",
      '  } catch (error) {',
      '  }',
      '}',
      '',
    ].join('\n'),
  );

  expect(throws).toStrictEqual([['catch', 4]]);
});

test('it keeps no throw entry for a change outside any catch block', async () => {
  const ctx = await setupTest();

  const throws = await ctx.sliceThrows(
    ctx.saveWithRollback,
    ctx.saveWithRollback.replace("db.run('BEGIN');", "db.run('BEGIN IMMEDIATE');"),
  );

  expect(throws).toStrictEqual([]);
});

test('it keeps a throw on an added line', async () => {
  const ctx = await setupTest();

  const throws = await ctx.sliceThrows(
    ctx.saveWithRollback,
    ctx.saveWithRollback.replace('throw error;', "throw new Error('save failed');"),
  );

  expect(throws).toStrictEqual([
    ['catch', 4],
    ['throw', 6],
  ]);
});
