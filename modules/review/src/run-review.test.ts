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

test('it keeps the files of the secrets risk class out of the worktree the calls read', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    {
      message: 'base',
      files: { 'src/total.ts': 'export const zero = 0;\n', '.env.local': 'TOKEN=example\n' },
    },
    {
      message: 'head',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
  ]);

  const stub = buildStubAdapter({
    L: [{ findings: { correctness: [], 'naming-shape-and-comments': [], tests: [] } }],
  });

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  await runReview({
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
    title: 'Add one',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(stub.seenFiles).not.toBeEmpty();

  expect(stub.seenFiles).toSatisfyAll(
    (files: string[]) => files.length === 1 && files[0] === join('src', 'total.ts'),
  );
});

test('it removes a submodule folder that the secrets risk class names and runs the calls', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'head',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
  ]);

  await ctx.runner.run(
    [
      'git',
      'update-index',
      '--add',
      '--cacheinfo',
      `160000,${repo.commits[0] ?? ''},secrets-module`,
    ],
    { cwd: repo.path },
  );

  await ctx.runner.run(['git', 'commit', '--quiet', '-m', 'Add the secrets module'], {
    cwd: repo.path,
  });

  const head = await ctx.runner.run(['git', 'rev-parse', 'HEAD'], { cwd: repo.path });

  const stub = buildStubAdapter({});

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/total',
    base: repo.commits[0] ?? '',
    head: head.stdout.trim(),
    config: BUILT_IN_DEFAULTS,
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Add one',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(stub.requests).not.toBeEmpty();
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

test('it keeps the planned order of the calls when they end in another order', async () => {
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
          '}',
          '',
        ].join('\n'),
      },
    },
  ]);

  const stub = buildStubAdapter(
    {
      A: [
        {
          findings: {
            correctness: [
              {
                title: 'Keep the jobs a caller still reads',
                body: 'The function empties the shared list, so a caller that holds it sees none.',
                anchor: { path: 'src/jobs.ts', startLine: 75, endLine: 75 },
                secondLocation: null,
                severity: 'P2',
                criterion: 'wrong-behaviour-edge-path',
                rule: null,
                verdict: 'CONFIRMED',
                unverifiedFact: null,
                missingChange: false,
                fix: null,
              },
            ],
          },
        },
      ],
      C: [{ findings: { 'naming-shape-and-comments': [] } }],
      E: [{ findings: { tests: [] } }],
    },
    { A: 60, C: 30 },
  );

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

  expect(stub.ended).toStrictEqual(['E', 'C', 'A']);
  expect(run.result.calls.map((call) => call.id)).toStrictEqual(['A', 'C', 'E']);

  expect(run.result.findings.map((finding) => [finding.title, finding.callID])).toStrictEqual([
    ['Keep the jobs a caller still reads', 'A'],
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
      ['standard:A', 'standard', 'medium'],
      ['standard:C', 'standard', 'medium'],
      ['standard:E', 'standard', 'medium'],
      ['A:correctness', 'deep', 'high'],
      ['A:failure-handling-and-observability', 'deep', 'high'],
      ['C', 'deep', 'high'],
      ['E', 'deep', 'high'],
      ['verify:A:correctness', 'deep', 'high'],
    ],
    [['Keep the jobs until the write succeeds', 'P1']],
  ]);
});

test('it runs no call on a release bump', async () => {
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
});

test('it drops a stepped-up P1 that the verify pass rejects and removes the worktree', async () => {
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
    'verify:A:correctness': [{ findings: { correctness: [] } }],
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

  const left = await readdir(join(ctx.dir, 'temp'));

  const worktrees = await ctx.runner.run(['git', 'worktree', 'list', '--porcelain'], {
    cwd: repo.path,
  });

  expect([run.result.depth, run.result.findings]).toStrictEqual(['deep', []]);
  expect(left).toStrictEqual(['.keep']);
  expect(worktrees.stdout.match(/^worktree /gmu)).toHaveLength(1);
});

test('it keeps a Deep call findings when its verify call fails twice', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/auth/session.ts': 'export const ttl = 60;\n' } },
    { message: 'head', files: { 'src/auth/session.ts': 'export const ttl = 6000;\n' } },
  ]);

  const p2 = {
    title: 'Keep the session lifetime short',
    body: 'A lifetime of 6000 seconds keeps a stolen session open for hours.',
    anchor: { path: 'src/auth/session.ts', startLine: 1, endLine: 1 },
    secondLocation: null,
    severity: 'P2',
    criterion: 'wrong-behaviour-edge-path',
    rule: null,
    verdict: 'CONFIRMED',
    unverifiedFact: null,
    missingChange: false,
    fix: null,
  } as const;

  const stub = buildStubAdapter({
    'A:correctness': [{ findings: { correctness: [p2] } }],
    B: [{ findings: { security: [] } }],
    'verify:A:correctness': [{ error: 'claude timed out' }, { error: 'claude timed out' }],
  });

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/auth',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: BUILT_IN_DEFAULTS,
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Lengthen the session',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect([
    run.result.depth,
    run.result.findings.map((finding) => finding.title),
    run.result.failedCalls.map((call) => call.id),
  ]).toStrictEqual(['deep', ['Keep the session lifetime short'], ['verify:A:correctness']]);
});

test('it sweeps a large Deep change for gaps when no blocking finding survives', async () => {
  const ctx = await setupTest();

  const files = Object.fromEntries(
    ['a', 'b', 'c', 'd', 'e'].map((name) => [`src/auth/${name}.ts`, `export const ${name} = 2;\n`]),
  );

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    {
      message: 'base',
      files: Object.fromEntries(Object.keys(files).map((path) => [path, 'export const x = 1;\n'])),
    },
    { message: 'head', files },
  ]);

  const stub = buildStubAdapter({
    'A:correctness': [{ findings: { correctness: [] } }],
    B: [{ findings: { security: [] } }],
    'gap:A:correctness': [{ findings: { correctness: [] } }],
    'gap:B': [{ findings: { security: [] } }],
  });

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/auth',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: BUILT_IN_DEFAULTS,
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Rename the auth constants',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(run.result.calls.map((call) => [call.id, call.status])).toStrictEqual([
    ['A:correctness', 'ok'],
    ['B', 'ok'],
    ['gap:A:correctness', 'ok'],
    ['gap:B', 'ok'],
  ]);
});
