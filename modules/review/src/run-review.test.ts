import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { BUILT_IN_DEFAULTS } from '@noslop/config';
import { createRunner } from '@noslop/runner';
import { buildStubAdapter, createTestRepo } from '@noslop/testing';
import { runReview } from './run-review';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-review-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir, runner: createRunner(), logger: getLogger(['test']) };
}

test('it reviews a small change at Light and reports the finding of its one call', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'head',
      files: {
        'src/total.ts': [
          'export const zero = 0;',
          '',
          'export function total(items: number[]): number {',
          '  return items.slice(1).reduce((sum, item) => sum + item, 0);',
          '}',
          '',
        ].join('\n'),
      },
    },
  ]);

  const stub = buildStubAdapter({
    L: [
      {
        findings: {
          correctness: [
            {
              title: 'Count the first item in the total',
              body: 'The slice drops the first item, so the total is short by it.',
              anchor: { path: 'src/total.ts', startLine: 4, endLine: 4 },
              secondLocation: null,
              severity: 'P2',
              criterion: 'wrong-behaviour-edge-path',
              rule: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: 'Reduce over the whole list.',
            },
          ],
          'naming-shape-and-comments': [],
          tests: [],
        },
      },
    ],
  });

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/total',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: BUILT_IN_DEFAULTS,
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Add the total',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect([
    run.result.depth,
    run.result.lenses,
    run.result.calls.map((call) => [call.id, call.status, call.attempts]),
    run.result.findings.map((finding) => [finding.title, finding.anchor, finding.writtenByChange]),
    run.result.failedCalls,
  ]).toStrictEqual([
    'light',
    ['correctness', 'naming-shape-and-comments', 'tests'],
    [['L', 'ok', 1]],
    [
      [
        'Count the first item in the total',
        { path: 'src/total.ts', startLine: 4, endLine: 4 },
        true,
      ],
    ],
    [],
  ]);
});

test('it retries a failed call once and lists a call that fails twice', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'head', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  const stub = buildStubAdapter({
    L: [{ error: 'codex timed out' }, { error: 'codex timed out' }],
  });

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/a',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: BUILT_IN_DEFAULTS,
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: '',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect([
    run.result.calls.map((call) => [call.id, call.status, call.attempts]),
    run.result.failedCalls,
  ]).toStrictEqual([
    [['L', 'failed', 2]],
    [{ id: 'L', lenses: ['correctness'], reason: 'codex timed out' }],
  ]);
});

test('it steps a Standard review up to Deep on a confirmed P1 and verifies the Deep findings', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/jobs.ts': 'export const jobs: string[] = [];\n' } },
    {
      message: 'head',
      files: {
        'src/jobs.ts': [
          'export const jobs: string[] = [];',
          '',
          ...Array.from({ length: 70 }, (_, index) => `export const job${index} = ${index};`),
          '',
          'export function clearJobs(): void {',
          '  jobs.length = 0;',
          "  throw new Error('cleared');",
          '}',
          '',
        ].join('\n'),
      },
    },
  ]);

  const p1 = {
    title: 'Keep the jobs until the write succeeds',
    body: 'The function empties the list before it throws, so the jobs are lost.',
    anchor: { path: 'src/jobs.ts', startLine: 75, endLine: 75 },
    secondLocation: null,
    severity: 'P1',
    criterion: 'data-loss',
    rule: null,
    verdict: 'CONFIRMED',
    unverifiedFact: null,
    missingChange: false,
    fix: null,
  } as const;

  const stub = buildStubAdapter({
    A: [{ findings: { correctness: [p1], 'failure-handling-and-observability': [] } }],
    'A:correctness': [{ findings: { correctness: [p1] } }],
    'A:failure-handling-and-observability': [
      { findings: { 'failure-handling-and-observability': [] } },
    ],
    C: [
      { findings: { 'naming-shape-and-comments': [] } },
      { findings: { 'naming-shape-and-comments': [] } },
    ],
    E: [{ findings: { tests: [] } }, { findings: { tests: [] } }],
    'verify:A:correctness': [{ findings: { correctness: [p1] } }],
  });

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/jobs',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: BUILT_IN_DEFAULTS,
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Clear the jobs',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect([
    run.result.depth,
    run.result.steppedUpFrom,
    run.result.calls.map((call) => [call.id, call.depth, call.effort]),
    run.result.findings.map((finding) => [finding.title, finding.severity]),
  ]).toStrictEqual([
    'deep',
    'standard',
    [
      ['A', 'standard', 'medium'],
      ['C', 'standard', 'medium'],
      ['E', 'standard', 'medium'],
      ['A:correctness', 'deep', 'high'],
      ['A:failure-handling-and-observability', 'deep', 'high'],
      ['C', 'deep', 'high'],
      ['E', 'deep', 'high'],
      ['verify:A:correctness', 'deep', 'high'],
    ],
    [['Keep the jobs until the write succeeds', 'P1']],
  ]);
});

test('it runs no call on a release bump and removes its worktree', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    {
      message: 'base',
      files: { 'package.json': '{\n  "name": "a",\n  "version": "1.0.0"\n}\n' },
    },
    {
      message: 'head',
      files: { 'package.json': '{\n  "name": "a",\n  "version": "1.1.0"\n}\n' },
    },
  ]);

  const stub = buildStubAdapter({});

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/a',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: BUILT_IN_DEFAULTS,
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Release 1.1.0',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect([run.result.special, run.result.calls, stub.requests]).toStrictEqual(['release', [], []]);

  const left = await readdir(join(ctx.dir, 'temp'));

  expect(left).toStrictEqual(['.keep']);
});
