import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import type { ReviewAdapter } from '@noslop/contract';
import { reviewResultSchema } from '@noslop/contract';
import { createGitHubConnection, createGitHubReporter } from '@noslop/github';
import { createRunner } from '@noslop/runner';
import { createSQLiteReporter } from '@noslop/sqlite';
import {
  STUB_APP_LOGIN,
  buildStubAdapter,
  buildStubAppKey,
  createTestRepo,
  githubCollections,
} from '@noslop/testing';
import type { CLIContext } from './cli-context';
import { createJSONReporter } from './create-json-reporter';
import { runCLI } from './run-cli';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-cli-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const stdout: string[] = [];
  const stderr: string[] = [];

  const buildContext = (cwd: string, adapter: ReviewAdapter): CLIContext => ({
    runner: createRunner(),
    cwd,
    cacheDir: join(dir, 'cache'),
    dataDir: join(dir, 'data'),
    logger: getLogger(['test']),
    writeStdout: (text) => {
      stdout.push(text);
    },
    writeStderr: (text) => {
      stderr.push(text);
    },
    createAdapter: () => adapter,
    createReporter: (id) =>
      ({
        json: createJSONReporter((text) => {
          stdout.push(text);
        }),
        sqlite: createSQLiteReporter(join(dir, 'data', 'store.sqlite')),
        github: createGitHubReporter({ loadConnection }),
      })[id] ?? null,
    loadGitHubConnection: loadConnection,
  });

  const privateKey = buildStubAppKey();
  const loadConnection = () => createGitHubConnection({ appID: 1, privateKey, installationID: 7 });

  return { dir, stdout, stderr, buildContext };
}

test('it reviews the change between 2 commits and prints the result as JSON', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the total\n\nSums the items.',
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
              fix: null,
            },
          ],
          'naming-shape-and-comments': [],
          tests: [],
        },
      },
    ],
  });

  const code = await runCLI(
    ['review', '--base', repo.commits[0] ?? '', '--head', repo.commits[1] ?? '', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));

  const left = await readdir(join(ctx.dir, 'cache', 'reviews'));

  expect(code).toBe(0);

  expect([result.title, result.depth, result.head]).toStrictEqual([
    'Add the total',
    'light',
    repo.commits[1] ?? '',
  ]);

  expect(result.findings.map((finding) => [finding.anchor, finding.title])).toStrictEqual([
    [{ path: 'src/total.ts', startLine: 4, endLine: 4 }, 'Count the first item in the total'],
  ]);

  expect(stub.requests.map((request) => request.prompt)).toSatisfyAll((prompt: string) =>
    prompt.includes('Sums the items.'),
  );

  expect(left).toStrictEqual([]);
});

test('it titles the review with the head subject and gives the calls every commit message', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'Start the change\n\nFirst step.', files: { 'src/a.ts': 'export const a = 2;\n' } },
    { message: 'Finish the change', files: { 'src/a.ts': 'export const a = 3;\n' } },
  ]);

  const stub = buildStubAdapter({ L: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['review', '--base', repo.commits[0] ?? '', '--head', repo.commits[2] ?? '', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));
  const prompt = stub.requests[0]?.prompt ?? '';

  expect(result.title).toBe('Finish the change');
  expect(prompt.indexOf('First step.')).toBeLessThan(prompt.lastIndexOf('Finish the change'));
  expect(prompt).toInclude('Start the change');
});

test('it prints a summary for a person without --json', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'docs/guide.md': '# Guide\n' } },
    { message: 'Edit the guide', files: { 'docs/guide.md': '# Guide\n\nRun the tool.\n' } },
  ]);

  const stub = buildStubAdapter({ D: [{ findings: { documentation: [] } }] });

  const code = await runCLI(
    ['review', '--base', repo.commits[0] ?? '', '--head', repo.commits[1] ?? ''],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(code).toBe(0);
  expect(ctx.stdout.join('')).toStartWith(`noslop reviewed ${repo.commits[1]?.slice(0, 12)} at`);
});

test('it records the review in the store and answers a store query', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    {
      message: 'base',
      files: {
        'review.json': '{ "report": ["sqlite"] }\n',
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    { message: 'Change a', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  const stub = buildStubAdapter({
    L: [
      {
        findings: {
          correctness: [
            {
              title: 'Keep a at 1',
              body: 'Every caller reads a as 1.',
              anchor: { path: 'src/a.ts', startLine: 1, endLine: 1 },
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
  });

  const context = ctx.buildContext(repo.path, stub.adapter);

  await runCLI(
    ['review', '--base', repo.commits[0] ?? '', '--head', repo.commits[1] ?? '', '--json'],
    context,
  );

  ctx.stdout.length = 0;

  const code = await runCLI(['store', 'query', 'open-findings', '--json'], context);

  const rows: unknown = JSON.parse(ctx.stdout.join(''));

  expect(code).toBe(0);
  expect(rows).toMatchObject([{ title: 'Keep a at 1', path: 'src/a.ts', severity: 'P2' }]);
});

test('it prints the merged config with the source of each key', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'review.json': '{ "adapter": "claude" }\n' } },
  ]);

  const code = await runCLI(
    ['config', '--json'],
    ctx.buildContext(repo.path, buildStubAdapter({}).adapter),
  );

  const output: unknown = JSON.parse(ctx.stdout.join(''));

  expect(code).toBe(0);

  expect(output).toMatchObject({
    config: { adapter: 'claude' },
    sources: { adapter: join(repo.path, 'review.json') },
  });
});

test('it exits 1 and names the problem when a command fails', async () => {
  const ctx = await setupTest();

  const code = await runCLI(
    ['store', 'query', 'no-such-query'],
    ctx.buildContext(ctx.dir, buildStubAdapter({}).adapter),
  );

  expect(code).toBe(1);
  expect(ctx.stderr.join('')).toStartWith('noslop: name a store query: yield-by-lens');
});

test('it reviews a pull request from GitHub and posts its findings and the check', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the total',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = zero - 1;\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add the total',
    body: 'Adds one.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/total.ts',
    lines: [2],
  });

  const stub = buildStubAdapter({
    L: [
      {
        findings: {
          correctness: [
            {
              title: 'Add one, not subtract it',
              body: 'The constant is named one but holds -1.',
              anchor: { path: 'src/total.ts', startLine: 2, endLine: 2 },
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
  });

  const code = await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'github', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));

  expect(code).toBe(0);

  expect([result.pullRequest, result.base, result.head, result.title]).toStrictEqual([
    { owner: 'example', repo: 'app', number: 9 },
    repo.commits[0] ?? '',
    repo.commits[1] ?? '',
    'Add the total',
  ]);

  expect(
    githubCollections.reviewComments.all().map((comment) => [comment.path, comment.line]),
  ).toStrictEqual([['src/total.ts', 2]]);

  expect(githubCollections.checkRuns.all()).toMatchObject([
    { name: 'noslop', headSha: repo.commits[1] ?? '', conclusion: 'failure' },
  ]);
});

test('it sets the check of a pull request again from its replies', async () => {
  const ctx = await setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    headSha: 'b'.repeat(40),
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","reviews":1,"reported":[],"failedCalls":0} -->`,
  });

  const code = await runCLI(
    ['check', '--pr', '9', '--repo', 'example/app', '--json'],
    ctx.buildContext(ctx.dir, buildStubAdapter({}).adapter),
  );

  const outcome: unknown = JSON.parse(ctx.stdout.join(''));

  expect(code).toBe(0);
  expect(outcome).toMatchObject({ conclusion: 'success' });
  expect(githubCollections.checkRuns.all()).toMatchObject([{ conclusion: 'success' }]);
});

test('it puts an unknown option on stderr and keeps stdout empty', async () => {
  const ctx = await setupTest();

  const code = await runCLI(
    ['review', '--no-such-flag', '--json'],
    ctx.buildContext(ctx.dir, buildStubAdapter({}).adapter),
  );

  expect(code).toBe(1);
  expect(ctx.stdout).toStrictEqual([]);
  expect(ctx.stderr.join('')).toInclude('no-such-flag');
});

test('it reads the repo config when it runs from a subfolder', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.dir, 'repo'), [
    {
      message: 'base',
      files: { 'review.json': '{ "adapter": "claude" }\n', 'src/a.ts': 'export const a = 1;\n' },
    },
  ]);

  await runCLI(
    ['config', '--json'],
    ctx.buildContext(join(repo.path, 'src'), buildStubAdapter({}).adapter),
  );

  const output: unknown = JSON.parse(ctx.stdout.join(''));

  expect(output).toMatchObject({ config: { adapter: 'claude' } });
});
