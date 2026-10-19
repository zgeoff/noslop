import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import { BUILT_IN_DEFAULTS } from '@noslop/config';
import { buildFindingID } from '@noslop/findings';
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
              ruleQuote: null,
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

test('it merges the findings that the merge pass groups into the one with the higher severity', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/queue.ts': 'export const queue: string[] = [];\n' } },
    {
      message: 'head',
      files: {
        'src/queue.ts': [
          'export const queue: string[] = [];',
          '',
          'export function flush(write: (items: string[]) => void): void {',
          '  queue.length = 0;',
          '  write(queue);',
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
              title: 'Write the queue before emptying it',
              body: 'The function empties the queue, then writes the empty list.',
              anchor: { path: 'src/queue.ts', startLine: 4, endLine: 5 },
              secondLocation: null,
              severity: 'P1',
              criterion: 'data-loss',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: null,
            },
          ],
          'naming-shape-and-comments': [
            {
              title: 'Keep the items flush is meant to write',
              body: 'The write receives the list after it is cleared.',
              anchor: { path: 'src/queue.ts', startLine: 4, endLine: 4 },
              secondLocation: null,
              severity: 'P2',
              criterion: 'wrong-behaviour-edge-path',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: null,
            },
          ],
          tests: [],
        },
      },
    ],
    merge: [
      {
        groups: [
          [
            buildFindingID(
              'naming-shape-and-comments',
              'src/queue.ts',
              'wrong-behaviour-edge-path',
              'Keep the items flush is meant to write',
            ),
            buildFindingID(
              'correctness',
              'src/queue.ts',
              'data-loss',
              'Write the queue before emptying it',
            ),
          ],
        ],
      },
    ],
  });

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/queue',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: BUILT_IN_DEFAULTS,
    mergeModel: 'small-model',
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Flush the queue',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(run.result.findings.map((finding) => [finding.lens, finding.severity])).toStrictEqual([
    ['correctness', 'P1'],
  ]);

  expect(
    run.result.calls.map((call) => [call.id, call.status, call.model, call.effort]),
  ).toStrictEqual([
    ['L', 'ok', null, 'low'],
    ['merge', 'ok', 'small-model', 'low'],
  ]);
});

test('it runs no merge pass when the config turns it off', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/queue.ts': 'export const queue: string[] = [];\n' } },
    {
      message: 'head',
      files: {
        'src/queue.ts': [
          'export const queue: string[] = [];',
          '',
          'export function flush(write: (items: string[]) => void): void {',
          '  queue.length = 0;',
          '  write(queue);',
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
              title: 'Write the queue before emptying it',
              body: 'The function empties the queue, then writes the empty list.',
              anchor: { path: 'src/queue.ts', startLine: 4, endLine: 5 },
              secondLocation: null,
              severity: 'P1',
              criterion: 'data-loss',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: null,
            },
          ],
          'naming-shape-and-comments': [
            {
              title: 'Keep the items flush is meant to write',
              body: 'The write receives the list after it is cleared.',
              anchor: { path: 'src/queue.ts', startLine: 4, endLine: 4 },
              secondLocation: null,
              severity: 'P2',
              criterion: 'wrong-behaviour-edge-path',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: null,
            },
          ],
          tests: [],
        },
      },
    ],
  });

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/queue',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: { ...BUILT_IN_DEFAULTS, mergePass: { enabled: false, effort: 'low' } },
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Flush the queue',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(stub.requests.map((request) => request.callID)).toStrictEqual(['L']);
  expect(run.result.findings).toHaveLength(2);
});

test('it keeps every finding and records the merge call as failed when the merge pass fails', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/queue.ts': 'export const queue: string[] = [];\n' } },
    {
      message: 'head',
      files: {
        'src/queue.ts': [
          'export const queue: string[] = [];',
          '',
          'export function flush(write: (items: string[]) => void): void {',
          '  queue.length = 0;',
          '  write(queue);',
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
              title: 'Write the queue before emptying it',
              body: 'The function empties the queue, then writes the empty list.',
              anchor: { path: 'src/queue.ts', startLine: 4, endLine: 5 },
              secondLocation: null,
              severity: 'P1',
              criterion: 'data-loss',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: null,
            },
          ],
          'naming-shape-and-comments': [
            {
              title: 'Keep the items flush is meant to write',
              body: 'The write receives the list after it is cleared.',
              anchor: { path: 'src/queue.ts', startLine: 4, endLine: 4 },
              secondLocation: null,
              severity: 'P2',
              criterion: 'wrong-behaviour-edge-path',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: null,
            },
          ],
          tests: [],
        },
      },
    ],
    merge: [{ error: 'codex exited 1 on call merge' }],
  });

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/queue',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: BUILT_IN_DEFAULTS,
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Flush the queue',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(run.result.findings).toHaveLength(2);

  expect(run.result.calls.map((call) => [call.id, call.status])).toStrictEqual([
    ['L', 'ok'],
    ['merge', 'failed'],
  ]);

  expect(run.result.failedCalls).toStrictEqual([]);
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
          ...Array.from({ length: 420 }, (_, index) => `export const job${index} = ${index};`),
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
                ruleQuote: null,
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

test('it keeps a confirmed P1 at Standard and runs no call past the lens calls', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/jobs.ts': 'export const jobs: string[] = [];\n' } },
    {
      message: 'head',
      files: {
        'src/jobs.ts': [
          'export const jobs: string[] = [];',
          '',
          ...Array.from({ length: 420 }, (_, index) => `export const job${index} = ${index};`),
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
    ruleQuote: null,
    verdict: 'CONFIRMED',
    unverifiedFact: null,
    missingChange: false,
    fix: null,
  } as const;

  const stub = buildStubAdapter({
    A: [{ findings: { correctness: [p1], 'failure-handling-and-observability': [] } }],
    C: [{ findings: { 'naming-shape-and-comments': [] } }],
    E: [{ findings: { tests: [] } }],
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

  expect([
    run.result.depth,
    run.result.calls.map((call) => [call.id, call.depth, call.effort]),
    run.result.findings.map((finding) => [finding.title, finding.severity]),
  ]).toStrictEqual([
    'standard',
    [
      ['A', 'standard', 'medium'],
      ['C', 'standard', 'medium'],
      ['E', 'standard', 'medium'],
    ],
    [['Keep the jobs until the write succeeds', 'P1']],
  ]);

  expect(left).toStrictEqual(['.keep']);
  expect(worktrees.stdout.match(/^worktree /gmu)).toHaveLength(1);
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

test('it runs only the group calls on a risk class change that holds no finding', async () => {
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
    A: [{ findings: { correctness: [] } }],
    B: [{ findings: { security: [] } }],
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

  expect(run.result.calls.map((call) => [call.id, call.lenses, call.status])).toStrictEqual([
    ['A', ['correctness'], 'ok'],
    ['B', ['security'], 'ok'],
  ]);
});

test('it gives the calls only the reference rules whose globs match a changed path', async () => {
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
          '  return items.reduce((sum, item) => sum + item, 0);',
          '}',
          '',
        ].join('\n'),
      },
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
    rules: [
      { name: 'SKILL.md: Naming', body: '1. Start with a verb.', paths: null },
      { name: 'references/ts.md: Types', body: '1. Name each type.', paths: ['**/*.ts'] },
      { name: 'references/nix.md: VM tests', body: '1. Boot once.', paths: ['**/*.nix'] },
    ],
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

  const prompt = stub.requests[0]?.prompt ?? '';

  expect(prompt).toInclude('### SKILL.md: Naming');
  expect(prompt).toInclude('### references/ts.md: Types');
  expect(prompt).not.toInclude('references/nix.md');
});

test('it runs no call and records no lens as run when the file limit leaves out every file', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'README.txt': 'tables\n' } },
    {
      message: 'head',
      files: {
        'README.txt': 'tables\n',
        'src/table.ts': `export const table = '${'t'.repeat(300_000)}';\n`,
      },
    },
  ]);

  const stub = buildStubAdapter({});

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/tables',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: BUILT_IN_DEFAULTS,
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Add the table',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(stub.requests).toStrictEqual([]);
  expect(run.result.calls).toStrictEqual([]);
  expect(run.result.lenses).toStrictEqual([]);
  expect(run.result.notReviewed).toStrictEqual([{ path: 'src/table.ts', reason: 'too-large' }]);
});

test('it records no lens as run when every file overflows a call alone', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/zero.ts': 'export const zero = 0;\n' } },
    {
      message: 'head',
      files: {
        'src/zero.ts': 'export const zero = 0;\n',
        'src/a.ts': `export const a = '${'a'.repeat(400_000)}';\n`,
        'src/b.ts': `export const b = '${'b'.repeat(400_000)}';\n`,
      },
    },
  ]);

  const stub = buildStubAdapter({});

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/tables',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: {
      ...BUILT_IN_DEFAULTS,
      thresholds: { ...BUILT_IN_DEFAULTS.thresholds, maxCallChars: 300_000, maxFileChars: 500_000 },
    },
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Add the tables',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(run.result.calls).toStrictEqual([]);
  expect(run.result.lenses).toStrictEqual([]);

  expect(run.result.notReviewed).toStrictEqual([
    { path: 'src/a.ts', reason: 'too-large' },
    { path: 'src/b.ts', reason: 'too-large' },
  ]);
});

test('it lists a file over the file limit as too large in the review result', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/zero.ts': 'export const zero = 0;\n' } },
    {
      message: 'head',
      files: {
        'src/zero.ts': 'export const zero = 0;\n',
        'src/a.ts': 'export const a = 1;\n',
        'src/big.ts': `export const big = '${'g'.repeat(5000)}';\n`,
      },
    },
  ]);

  const stub = buildStubAdapter({ L: [{ findings: { correctness: [] } }] });

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/tables',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: {
      ...BUILT_IN_DEFAULTS,
      mergePass: { enabled: false, effort: 'low' },
      thresholds: { ...BUILT_IN_DEFAULTS.thresholds, maxFileChars: 2000 },
    },
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Add the tables',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(run.result.calls.map((call) => [call.id, call.status])).toStrictEqual([['L', 'ok']]);

  expect(stub.requests.map((request) => request.prompt)).toStrictEqual([
    expect.toInclude('- `src/big.ts`: too large for one call'),
  ]);

  expect(stub.requests[0]?.prompt).not.toInclude('g'.repeat(1000));
  expect(run.result.notReviewed).toStrictEqual([{ path: 'src/big.ts', reason: 'too-large' }]);
});

test('it lists a file under each lens whose call its function slice pushes over the file limit while the intent call reads it', async () => {
  const ctx = await setupTest();

  const name = `parse${'x'.repeat(1500)}`;

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/zero.ts': 'export const zero = 0;\n' } },
    {
      message: 'head',
      files: {
        'src/zero.ts': 'export const zero = 0;\n',
        'src/parse.ts': `export function ${name}(text: string): number {\n  return text.length;\n}\n`,
      },
    },
  ]);

  const stub = buildStubAdapter({
    A: [{ findings: { correctness: [] } }],
    C: [{ findings: { 'naming-shape-and-comments': [] } }],
    E: [{ findings: { intent: [], tests: [] } }],
  });

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/parser',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: {
      ...BUILT_IN_DEFAULTS,
      mergePass: { enabled: false, effort: 'low' },
      thresholds: { ...BUILT_IN_DEFAULTS.thresholds, maxFileChars: 2500 },
    },
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Add the parser',
    body: '',
    linkedIssue: 'Count the characters of a text.',
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
    depth: 'standard',
  });

  expect(stub.requests.map((request) => request.callID)).toStrictEqual(['E']);
  expect(run.result.notReviewed).toStrictEqual([]);

  expect(run.result.notReviewedByLens).toStrictEqual([
    { path: 'src/parse.ts', lenses: ['correctness', 'naming-shape-and-comments'] },
  ]);
});

test('it lists the data file of a change that runs no call', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'samples/corpus.jsonl': '{"text":"one"}\n' } },
    {
      message: 'head',
      files: { 'samples/corpus.jsonl': '{"text":"one"}\n{"text":"two"}\n' },
    },
  ]);

  const stub = buildStubAdapter({});

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/corpus',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: { ...BUILT_IN_DEFAULTS, data: ['samples/**'] },
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Refresh the corpus',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(run.result.calls).toStrictEqual([]);
  expect(run.result.notReviewed).toStrictEqual([{ path: 'samples/corpus.jsonl', reason: 'data' }]);
});

test('it lists a data file that only a merge from the base branch changes as not reviewed', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    {
      message: 'base',
      files: { 'samples/corpus.jsonl': '{"text":"one"}\n', 'docs/guide.md': '# Guide\n' },
    },
    { message: 'Name the guide', files: { 'docs/guide.md': '# The guide\n' } },
    {
      message: 'Refresh the corpus',
      files: { 'samples/corpus.jsonl': '{"text":"one"}\n{"text":"two"}\n' },
      parent: 0,
    },
    {
      message: 'Merge main and retitle the guide',
      files: { 'docs/guide.md': '# A guide\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const stub = buildStubAdapter({});

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/corpus',
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
    mergeBase: repo.commits[2] ?? '',
    isIncremental: true,
    config: { ...BUILT_IN_DEFAULTS, data: ['samples/**'] },
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Retitle the guide',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(run.result.notReviewed).toStrictEqual([{ path: 'samples/corpus.jsonl', reason: 'data' }]);
});

test('it lists a source file over the file limit that only a merge from the base branch changes as too large', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    {
      message: 'base',
      files: {
        'src/table.ts': 'export const table = [];\n',
        'src/notes.ts': 'export const notes = [];\n',
        'docs/guide.md': '# Guide\n',
      },
    },
    { message: 'Name the guide', files: { 'docs/guide.md': '# The guide\n' } },
    {
      message: 'Fill the table and add a note',
      files: {
        'src/table.ts': `export const table = ['${'x'.repeat(300_000)}'];\n`,
        'src/notes.ts': "export const notes = ['one'];\n",
      },
      parent: 0,
    },
    {
      message: 'Merge main and retitle the guide',
      files: { 'docs/guide.md': '# A guide\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const stub = buildStubAdapter({});

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/table',
    base: repo.commits[1] ?? '',
    head: repo.commits[3] ?? '',
    mergeBase: repo.commits[2] ?? '',
    isIncremental: true,
    config: BUILT_IN_DEFAULTS,
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Retitle the guide',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(run.result.notReviewed).toStrictEqual([{ path: 'src/table.ts', reason: 'too-large' }]);
});

test('it splits a change over the prompt limit into calls that each fit and lists the data file it leaves out', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/zero.ts': 'export const zero = 0;\n' } },
    {
      message: 'head',
      files: {
        'src/zero.ts': 'export const zero = 0;\n',
        'src/a.ts': `export const a = '${'a'.repeat(400_000)}';\n`,
        'src/b.ts': `export const b = '${'b'.repeat(400_000)}';\n`,
        'src/c.ts': `export const c = '${'c'.repeat(400_000)}';\n`,
        'samples/corpus.jsonl': '{"text":"one"}\n{"text":"two"}\n',
      },
    },
  ]);

  const stub = buildStubAdapter({
    L: [{ findings: { correctness: [] } }],
    'L-part-2': [
      {
        findings: {
          correctness: [
            {
              title: 'Load the table from a file',
              body: 'The table sits inline in the module, so every import parses it.',
              anchor: { path: 'src/c.ts', startLine: 1, endLine: 1 },
              secondLocation: null,
              severity: 'P2',
              criterion: 'wrong-behaviour-edge-path',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: null,
            },
          ],
        },
      },
    ],
  });

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/tables',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    config: {
      ...BUILT_IN_DEFAULTS,
      mergePass: { enabled: false, effort: 'low' },
      data: ['samples/**'],
      thresholds: {
        ...BUILT_IN_DEFAULTS.thresholds,
        maxCallChars: 1_000_000,
        maxFileChars: 500_000,
      },
    },
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Add the tables',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(run.result.failedCalls).toStrictEqual([]);

  expect(run.result.calls.map((call) => [call.id, call.status])).toStrictEqual([
    ['L', 'ok'],
    ['L-part-2', 'ok'],
  ]);

  expect(stub.requests.map((request) => request.prompt.length)).toSatisfyAll(
    (length: number) => length <= 1_000_000,
  );

  const prompts = new Map(stub.requests.map((request) => [request.callID, request.prompt]));

  expect(prompts.get('L')).toInclude(`export const a = '${'a'.repeat(400_000)}';`);
  expect(prompts.get('L')).not.toInclude(`'${'c'.repeat(1000)}`);
  expect(prompts.get('L-part-2')).toInclude(`export const c = '${'c'.repeat(400_000)}';`);
  expect(prompts.get('L-part-2')).not.toInclude(`'${'a'.repeat(1000)}`);

  expect(stub.requests.map((request) => request.prompt)).toSatisfyAll(
    (prompt: string) =>
      !prompt.includes('{"text":"two"}') &&
      prompt.includes('- `samples/corpus.jsonl`: a data file the config names'),
  );

  expect(
    run.result.findings.map((finding) => [finding.callID, finding.title, finding.anchor.path]),
  ).toStrictEqual([['L-part-2', 'Load the table from a file', 'src/c.ts']]);

  expect(run.result.notReviewed).toStrictEqual([{ path: 'samples/corpus.jsonl', reason: 'data' }]);
});

test('it reports the finding of the design pass on a file that only an earlier review read', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/parse.ts': 'export const parse = 0;\n' } },
    {
      message: 'Add the scanner',
      files: {
        'src/parse.ts': 'export const parse = 0;\n',
        'src/scan.ts': 'export const separator = ":";\n',
      },
    },
    {
      message: 'Fix the parser',
      files: {
        'src/parse.ts': 'export const parse = 1;\n',
        'src/scan.ts': 'export const separator = ":";\n',
      },
    },
  ]);

  const stub = buildStubAdapter({
    L: [{ findings: { correctness: [] } }],
    design: [
      {
        findings: {
          design: [
            {
              title: 'Split the header line with the library parser',
              body: 'Each review patched the hand-written scanner for another separator case.',
              anchor: { path: 'src/scan.ts', startLine: 1, endLine: 1 },
              secondLocation: null,
              severity: 'P2',
              criterion: 'design-defect',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: 'Replace the scanner with the parser the library exports.',
            },
          ],
        },
      },
    ],
  });

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/parse',
    base: repo.commits[1] ?? '',
    head: repo.commits[2] ?? '',
    mergeBase: repo.commits[0] ?? '',
    isIncremental: true,
    round: 2,
    earlierFindings: [],
    config: BUILT_IN_DEFAULTS,
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Parse the header line',
    body: 'Parses the header line.',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(
    run.result.calls.map((call) => [call.id, call.lenses, call.status, call.effort]),
  ).toStrictEqual([
    ['L', ['correctness'], 'ok', 'low'],
    ['design', ['design'], 'ok', 'medium'],
  ]);

  expect(
    run.result.findings.map((finding) => [
      finding.lens,
      finding.callID,
      finding.title,
      finding.anchor.path,
      finding.severity,
      finding.writtenByChange,
    ]),
  ).toStrictEqual([
    [
      'design',
      'design',
      'Split the header line with the library parser',
      'src/scan.ts',
      'P2',
      true,
    ],
  ]);
});

test('it keeps the lens findings and fails no review when the design pass fails', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/parse.ts': 'export const parse = 0;\n' } },
    { message: 'Fix the parser', files: { 'src/parse.ts': 'export const parse = 1;\n' } },
  ]);

  const stub = buildStubAdapter({
    L: [
      {
        findings: {
          correctness: [
            {
              title: 'Start the parse at 0',
              body: 'The parser starts at 1, so it skips the first header.',
              anchor: { path: 'src/parse.ts', startLine: 1, endLine: 1 },
              secondLocation: null,
              severity: 'P2',
              criterion: 'wrong-behaviour-edge-path',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: null,
            },
          ],
        },
      },
    ],
    design: [{ error: 'the model CLI timed out' }],
  });

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  const run = await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/parse',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    round: 2,
    earlierFindings: [],
    config: BUILT_IN_DEFAULTS,
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Fix the parser',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(run.result.findings.map((finding) => finding.title)).toStrictEqual([
    'Start the parse at 0',
  ]);

  expect(run.result.calls.map((call) => [call.id, call.status])).toStrictEqual([
    ['L', 'ok'],
    ['design', 'failed'],
  ]);

  expect(run.result.failedCalls).toStrictEqual([]);
});

test('it runs no design pass on a later review when the config turns it off', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/parse.ts': 'export const parse = 0;\n' } },
    { message: 'Fix the parser', files: { 'src/parse.ts': 'export const parse = 1;\n' } },
  ]);

  const stub = buildStubAdapter({ L: [{ findings: { correctness: [] } }] });

  await Bun.write(join(ctx.dir, 'temp', '.keep'), '');

  await runReview({
    runner: ctx.runner,
    repoDir: repo.path,
    repo: 'example/parse',
    base: repo.commits[0] ?? '',
    head: repo.commits[1] ?? '',
    round: 2,
    earlierFindings: [],
    config: { ...BUILT_IN_DEFAULTS, designPass: { enabled: false, effort: 'medium' } },
    configHash: 'hash',
    rules: null,
    adapter: stub.adapter,
    logger: ctx.logger,
    tempDir: join(ctx.dir, 'temp'),
    cacheDir: null,
    title: 'Fix the parser',
    body: '',
    linkedIssue: null,
    pullRequest: null,
    isPush: false,
    pastEscapes: [],
  });

  expect(stub.requests.map((request) => request.callID)).toStrictEqual(['L']);
});
