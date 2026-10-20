import { Database } from 'bun:sqlite';
import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@logtape/logtape';
import type { ReviewAdapter } from '@noslop/contract';
import { reviewResultSchema } from '@noslop/contract';
import { createGitHubReporter } from '@noslop/github';
import { createRunner } from '@noslop/runner';
import { createSQLiteReporter, loadStore, runStoreQuery, writeReview } from '@noslop/sqlite';
import {
  STUB_APP_LOGIN,
  buildMockFinding,
  buildMockReviewResult,
  buildStubAdapter,
  buildStubAppKey,
  buildStubPrivateRepo,
  createTestRepo,
  githubCollections,
  githubServer,
} from '@noslop/testing';
import cliPackage from '../package.json' with { type: 'json' };
import type { CLIContext } from './cli-context';
import { createCLIContext } from './create-cli-context';
import type { GitHubConnectionLoader } from './create-github-connection-loader';
import { createGitHubConnectionLoader } from './create-github-connection-loader';
import { createJSONReporter } from './create-json-reporter';
import { runCLI } from './run-cli';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-cli-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const stdout: string[] = [];
  const stderr: string[] = [];
  const privateKey = buildStubAppKey();

  const appLoader = createGitHubConnectionLoader({
    NOSLOP_GITHUB_APP_ID: '1',
    NOSLOP_GITHUB_APP_PRIVATE_KEY: privateKey,
    NOSLOP_GITHUB_APP_INSTALLATION_ID: '7',
  });

  const buildContext = (
    cwd: string,
    adapter: ReviewAdapter,
    github: GitHubConnectionLoader = appLoader,
  ): CLIContext => ({
    runner: createRunner(),
    cwd,
    cacheDir: join(directory, 'cache'),
    dataDir: join(directory, 'data'),
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
        sqlite: createSQLiteReporter(join(directory, 'data', 'store.sqlite')),
        github: createGitHubReporter({ loadConnection: github.load }),
      })[id] ?? null,
    loadGitHubConnection: github.load,
    setGitHubAppSlug: github.setAppSlug,
  });

  return { directory, stdout, stderr, buildContext };
}

test('it reviews the change between 2 commits and prints the result as JSON', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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
    light: [
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

  const left = await readdir(join(ctx.directory, 'cache', 'reviews'));

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

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'Start the change\n\nFirst step.', files: { 'src/a.ts': 'export const a = 2;\n' } },
    { message: 'Finish the change', files: { 'src/a.ts': 'export const a = 3;\n' } },
  ]);

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

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

test('it reviews a local change that edits review.json under the config of its base', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'review.json': '{ "lenses": { "correctness": { "model": "base-model" } } }\n',
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'Change the model',
      files: {
        'review.json': '{ "lenses": { "correctness": { "model": "head-model" } } }\n',
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['review', '--base', repo.commits[0] ?? '', '--head', repo.commits[1] ?? '', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(stub.requests.map((request) => request.model)).toStrictEqual(['base-model']);
});

test('it reviews a pull request that edits review.json under the config of its base', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'review.json': '{ "lenses": { "correctness": { "model": "base-model" } } }\n',
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'Change the model',
      files: {
        'review.json': '{ "lenses": { "correctness": { "model": "head-model" } } }\n',
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Change the model',
    body: 'Moves the lens to another model.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(stub.requests.map((request) => request.model)).toStrictEqual(['base-model']);
});

test("it follows the base commit's symlinks to its config files", async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'config/review.json': '{ "extends": "./shared/base.json" }\n',
        'settings/base.json': '{ "lenses": { "correctness": { "model": "base-model" } } }\n',
        'src/a.ts': 'export const a = 1;\n',
      },
      links: { 'review.json': 'config/review.json', shared: 'settings' },
    },
    {
      message: 'Change the model',
      files: {
        'settings/base.json': '{ "lenses": { "correctness": { "model": "head-model" } } }\n',
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['review', '--base', repo.commits[0] ?? '', '--head', repo.commits[1] ?? '', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(stub.requests.map((request) => request.model)).toStrictEqual(['base-model']);
});

test('it reads a config file whose name starts with 2 dots from the base commit', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'review.json': '{ "extends": "./..base.json" }\n',
        '..base.json': '{ "lenses": { "correctness": { "model": "base-model" } } }\n',
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    {
      message: 'Change the model',
      files: {
        '..base.json': '{ "lenses": { "correctness": { "model": "head-model" } } }\n',
        'src/a.ts': 'export const a = 2;\n',
      },
    },
  ]);

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['review', '--base', repo.commits[0] ?? '', '--head', repo.commits[1] ?? '', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(stub.requests.map((request) => request.model)).toStrictEqual(['base-model']);
});

test('it prints a summary for a person without --json', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'docs/guide.md': '# Guide\n' } },
    { message: 'Edit the guide', files: { 'docs/guide.md': '# Guide\n\nRun the tool.\n' } },
  ]);

  const stub = buildStubAdapter({ light: [{ findings: { documentation: [] } }] });

  const code = await runCLI(
    ['review', '--base', repo.commits[0] ?? '', '--head', repo.commits[1] ?? ''],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(code).toBe(0);
  expect(ctx.stdout.join('')).toStartWith(`noslop reviewed ${repo.commits[1]?.slice(0, 12)} at`);
});

test('it records the review in the store and answers a store query', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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
    light: [
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

test('it fails a review before any lens call when the store schema is newer than this noslop', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'review.json': '{ "report": ["sqlite"] }\n',
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    { message: 'Change a', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  const storePath = join(ctx.directory, 'data', 'store.sqlite');

  const first = await loadStore(storePath);

  await first.destroy();

  const database = new Database(storePath, { strict: true });

  database.run(
    `INSERT INTO kysely_migration (name, timestamp) VALUES ('9999-a-later-schema', '2026-10-18T09:00:00.000Z')`,
  );

  database.close();

  const stub = buildStubAdapter({ light: [{ findings: {} }] });

  const code = await runCLI(
    ['review', '--base', repo.commits[0] ?? '', '--head', repo.commits[1] ?? '', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(code).toBe(1);

  expect(ctx.stderr.join('')).toStartWith(
    `noslop: the store schema 9999-a-later-schema is newer than this noslop (${cliPackage.version}), whose newest migration is `,
  );

  expect(stub.requests).toStrictEqual([]);
});

test('it prints the merged config with the source of each key', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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

test('it prints the config as JSON with only its config, sources, chain, missing rules and hash', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'review.json': '{ "adapter": "claude" }\n' } },
  ]);

  const code = await runCLI(
    ['config', '--json'],
    ctx.buildContext(repo.path, buildStubAdapter({}).adapter),
  );

  const output: unknown = JSON.parse(ctx.stdout.join(''));

  expect(code).toBe(0);
  expect(output).toContainAllKeys(['config', 'sources', 'chain', 'missingRules', 'hash']);
});

test('it names each repo: rules file that the repo does not hold', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'review.json': '{ "rules": ["repo:skills/tests/SKILL.md"] }\n' } },
  ]);

  const code = await runCLI(['config'], ctx.buildContext(repo.path, buildStubAdapter({}).adapter));

  expect(code).toBe(0);

  expect(ctx.stdout.join('')).toInclude(
    'rules file not in this repo, so no rules from it: skills/tests/SKILL.md',
  );
});

test('it exits 1 and names the problem when a command fails', async () => {
  const ctx = await setupTest();

  const code = await runCLI(
    ['store', 'query', 'no-such-query'],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  expect(code).toBe(1);
  expect(ctx.stderr.join('')).toStartWith('noslop: name a store query: yield-by-lens');
});

test.each([
  [['findings-by-pr', '--pr', '7a'], 'noslop: --pr takes a pull request number, not 7a'],
  [
    ['findings-by-pr', '--since', 'last week'],
    'noslop: --since takes an ISO time such as 2026-10-01T00:00:00Z, not last week',
  ],
  [
    ['open-findings', '--repo', 'example/app'],
    'noslop: --repo, --pr and --since apply only to findings-by-pr',
  ],
])('it exits 1 on the store query %p', async (args, message) => {
  const ctx = await setupTest();

  const code = await runCLI(
    ['store', 'query', ...args],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  expect(code).toBe(1);
  expect(ctx.stderr.join('')).toStartWith(message);
});

test('it lists the findings of the repo, pull request and time the flags name, from a time with an offset', async () => {
  const ctx = await setupTest();
  const store = await loadStore(join(ctx.directory, 'data', 'store.sqlite'));

  onTestFinished(() => store.destroy());

  await writeReview(
    store,
    buildMockReviewResult({
      reviewID: 'review-early',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      endedAt: '2026-10-17T11:59:00.000Z',
      findings: [buildMockFinding({ id: '1111111111111111' })],
    }),
  );

  await writeReview(
    store,
    buildMockReviewResult({
      reviewID: 'review-late',
      pullRequest: { owner: 'example', repo: 'app', number: 7 },
      endedAt: '2026-10-17T12:01:00.000Z',
      findings: [buildMockFinding({ id: '2222222222222222' })],
    }),
  );

  await writeReview(
    store,
    buildMockReviewResult({
      reviewID: 'review-other-pr',
      pullRequest: { owner: 'example', repo: 'app', number: 8 },
      endedAt: '2026-10-17T12:01:00.000Z',
      findings: [buildMockFinding({ id: '3333333333333333' })],
    }),
  );

  await writeReview(
    store,
    buildMockReviewResult({
      reviewID: 'review-other-repo',
      repo: 'example/other',
      pullRequest: { owner: 'example', repo: 'other', number: 7 },
      endedAt: '2026-10-17T12:01:00.000Z',
      findings: [buildMockFinding({ id: '4444444444444444' })],
    }),
  );

  const code = await runCLI(
    [
      'store',
      'query',
      'findings-by-pr',
      '--repo',
      'example/app',
      '--pr',
      '7',
      '--since',
      '2026-10-17T14:00:00+02:00',
      '--json',
    ],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  const rows: unknown = JSON.parse(ctx.stdout.join(''));

  expect(code).toBe(0);

  expect(rows).toStrictEqual([
    {
      repo: 'example/app',
      pullRequest: 7,
      head: 'b'.repeat(40),
      id: '2222222222222222',
      path: 'src/a.ts',
      startLine: 1,
      severity: 'P2',
      lens: 'correctness',
      rule: null,
      title: 'Return the total of every item',
      dispositionKind: null,
      dispositionValue: null,
      outcome: 'open',
      commentURL: null,
    },
  ]);
});

test('it reviews a pull request from GitHub and posts its findings and the check', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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
    light: [
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

test('it keeps the link to each posted finding comment in the store the config names', async () => {
  const ctx = await setupTest();

  const storePath = join(ctx.directory, 'custom', 'findings.sqlite');

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'review.json': `${JSON.stringify({ reporters: { sqlite: { path: storePath } } })}\n`,
        'src/total.ts': 'export const zero = 0;\n',
      },
    },
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
    light: [
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

  const installed = createCLIContext({
    XDG_DATA_HOME: join(ctx.directory, 'data'),
    XDG_CACHE_HOME: join(ctx.directory, 'cache'),
    NOSLOP_GITHUB_APP_ID: '1',
    NOSLOP_GITHUB_APP_PRIVATE_KEY: buildStubAppKey(),
    NOSLOP_GITHUB_APP_INSTALLATION_ID: '7',
  });

  const code = await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'sqlite,github', '--json'],
    { ...ctx.buildContext(repo.path, stub.adapter), createReporter: installed.createReporter },
  );

  const store = await loadStore(storePath);

  onTestFinished(() => store.destroy());

  const rows = await runStoreQuery(store, 'findings-by-pr');

  const [comment] = githubCollections.reviewComments.all();

  expect(code).toBe(0);

  expect(rows).toMatchObject([
    { commentURL: `https://github.com/example/app/pull/9#discussion_r${comment?.id}` },
  ]);
});

test('it creates no store when a review posts to GitHub with no sqlite reporter', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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
    light: [
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

  const installed = createCLIContext({
    XDG_DATA_HOME: join(ctx.directory, 'data'),
    XDG_CACHE_HOME: join(ctx.directory, 'cache'),
    NOSLOP_GITHUB_APP_ID: '1',
    NOSLOP_GITHUB_APP_PRIVATE_KEY: buildStubAppKey(),
    NOSLOP_GITHUB_APP_INSTALLATION_ID: '7',
  });

  const code = await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'github', '--json'],
    {
      ...ctx.buildContext(repo.path, stub.adapter),
      dataDir: installed.dataDir,
      createReporter: installed.createReporter,
    },
  );

  const hasStore = await Bun.file(join(installed.dataDir, 'store.sqlite')).exists();

  expect(code).toBe(0);
  expect(githubCollections.reviewComments.all()).toHaveLength(1);
  expect(hasStore).toBe(false);
});

test('it gives the calls the issue that the pull request body closes', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add one',
    body: 'Adds one.\n\nFixes #3',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  await githubCollections.issues.create({
    owner: 'example',
    repo: 'app',
    number: 3,
    title: 'Export a constant for one',
    body: 'Callers write 1 by hand.',
  });

  const stub = buildStubAdapter({
    light: [{ findings: { correctness: [], intent: [] } }],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(stub.requests[0]?.prompt).toInclude(
    '## Linked issue\n\n#3 Export a constant for one\n\nCallers write 1 by hand.',
  );
});

test('it fires the intent lens on a local change with the text of the issue file', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
  ]);

  await Bun.write(
    join(ctx.directory, 'issue.md'),
    'GEO-12 Export a constant for one\n\nCallers write 1.\n',
  );

  const stub = buildStubAdapter({
    light: [{ findings: { correctness: [], intent: [] } }],
  });

  const code = await runCLI(
    [
      'review',
      '--base',
      repo.commits[0] ?? '',
      '--issue-file',
      join(ctx.directory, 'issue.md'),
      '--report',
      'json',
      '--json',
    ],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout[0] ?? ''));

  expect(code).toBe(0);
  expect(result.lenses).toContain('intent');

  expect(stub.requests[0]?.prompt).toInclude(
    '## Linked issue\n\nGEO-12 Export a constant for one\n\nCallers write 1.',
  );
});

test('it gives the calls the issue file in place of the issue the pull request body closes', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add one',
    body: 'Adds one.\n\nFixes #3',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  await githubCollections.issues.create({
    owner: 'example',
    repo: 'app',
    number: 3,
    title: 'Export a constant for one',
    body: 'Callers write 1 by hand.',
  });

  await Bun.write(join(ctx.directory, 'issue.md'), 'GEO-12 Export one from the totals module\n');

  const stub = buildStubAdapter({
    light: [{ findings: { correctness: [], intent: [] } }],
  });

  await runCLI(
    [
      'review',
      '--pr',
      '9',
      '--repo',
      'example/app',
      '--issue-file',
      join(ctx.directory, 'issue.md'),
      '--report',
      'json',
      '--json',
    ],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(stub.requests[0]?.prompt).toInclude(
    '## Linked issue\n\nGEO-12 Export one from the totals module',
  );

  expect(stub.requests[0]?.prompt).not.toInclude('Callers write 1 by hand.');
});

test('it fails the review when the issue file does not exist', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
  ]);

  const stub = buildStubAdapter({});

  const code = await runCLI(
    ['review', '--base', repo.commits[0] ?? '', '--issue-file', 'missing.md', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(code).toBe(1);
  expect(ctx.stderr.join('')).toInclude('--issue-file names no file: missing.md');
  expect(stub.requests).toBeEmpty();
});

test('it reviews a pull request from the head of its last review', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
    {
      message: 'Add two',
      files: {
        'src/total.ts': 'export const zero = 0;\nexport const one = 1;\nexport const two = 2;\n',
      },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add one and two',
    body: 'Adds one and two.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","reviews":1,"reported":[],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    light: [{ findings: { correctness: [] } }],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));

  expect(result.base).toBe(repo.commits[1] ?? '');
});

test('it reads a pull request of a private repo with GH_TOKEN and no App keys', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
  ]);

  githubServer.use(buildStubPrivateRepo({ owner: 'example', repo: 'app', token: 'ghp_reader' }));

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add one',
    body: 'Adds one.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  const stub = buildStubAdapter({
    light: [{ findings: { correctness: [] } }],
  });

  const code = await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(
      repo.path,
      stub.adapter,
      createGitHubConnectionLoader({ GH_TOKEN: 'ghp_reader' }),
    ),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));

  expect(code).toBe(0);
  expect(result.pullRequest).toStrictEqual({ owner: 'example', repo: 'app', number: 9 });
  expect(result.head).toBe(repo.commits[1] ?? '');
});

test('it fails to read a pull request of a private repo with no token', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
  ]);

  githubServer.use(buildStubPrivateRepo({ owner: 'example', repo: 'app', token: 'ghp_reader' }));

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  const code = await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, buildStubAdapter({}).adapter, createGitHubConnectionLoader({})),
  );

  expect(code).toBe(1);
  expect(ctx.stdout).toStrictEqual([]);
});

test('it reviews a pull request from the head of a summary by the App the config names, with a token', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'review.json': JSON.stringify({ github: { app: 'example-reviewer' } }),
        'src/total.ts': 'export const zero = 0;\n',
      },
    },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
    {
      message: 'Add two',
      files: {
        'src/total.ts': 'export const zero = 0;\nexport const one = 1;\nexport const two = 2;\n',
      },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add one and two',
    body: 'Adds one and two.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: 'example-reviewer[bot]',
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","reviews":1,"reported":[],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    light: [{ findings: { correctness: [] } }],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(
      repo.path,
      stub.adapter,
      createGitHubConnectionLoader({ GH_TOKEN: 'ghp_reader' }),
    ),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));

  expect(result.base).toBe(repo.commits[1] ?? '');
});

test('it reviews the whole pull request when a summary comes from another login than the App the config names', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'review.json': JSON.stringify({ github: { app: 'example-reviewer' } }),
        'src/total.ts': 'export const zero = 0;\n',
      },
    },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
    {
      message: 'Add two',
      files: {
        'src/total.ts': 'export const zero = 0;\nexport const one = 1;\nexport const two = 2;\n',
      },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add one and two',
    body: 'Adds one and two.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: 'impostor-reviewer[bot]',
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","reviews":1,"reported":[],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    light: [{ findings: { correctness: [] } }],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(
      repo.path,
      stub.adapter,
      createGitHubConnectionLoader({ GH_TOKEN: 'ghp_reader' }),
    ),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));

  expect(result.base).toBe(repo.commits[0] ?? '');
});

test('it drops a finding answered not-a-defect in a thread of the App the config names, with a token', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'review.json': JSON.stringify({ github: { app: 'example-reviewer' } }),
        'src/total.ts': 'export const zero = 0;\n',
      },
    },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add one',
    body: 'Adds one.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  const posted = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/total.ts',
    line: 2,
    authorLogin: 'example-reviewer[bot]',
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Name the constant for its use","path":"src/total.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"criterion":"wrong-behaviour-edge-path","rule":null,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: 'not-a-defect the name matches the domain',
    authorLogin: 'dev',
    inReplyToID: posted.id,
  });

  const stub = buildStubAdapter({
    light: [
      {
        findings: {
          correctness: [
            {
              title: 'Name the constant for its use',
              body: 'The name one says nothing of what the constant counts.',
              anchor: { path: 'src/total.ts', startLine: 2, endLine: 2 },
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

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json', '--full'],
    ctx.buildContext(
      repo.path,
      stub.adapter,
      createGitHubConnectionLoader({ GH_TOKEN: 'ghp_reader' }),
    ),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));

  expect(result.findings).toStrictEqual([]);

  expect(result.dropped).toPartiallyContain({
    reason: 'answered-not-a-defect',
    answeredID: '1111111111111111',
  });
});

test('it refuses an App slug in the config that differs from the App of the keys', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'review.json': JSON.stringify({ github: { app: 'example-reviewer' } }),
        'src/total.ts': 'export const zero = 0;\n',
      },
    },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  const code = await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, buildStubAdapter({}).adapter),
  );

  expect(code).toBe(1);

  expect(ctx.stderr.join('')).toStartWith(
    `noslop: github.app names the App example-reviewer, but the App's keys belong to ${STUB_APP_LOGIN}; set github.app to the slug of the App that posts the reviews`,
  );
});

test('it reviews only the files the pull request changes after it merges its base branch', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'AGENTS.md': '# Agents\n\nRun the tests before every push.\n',
        'skills/notes/SKILL.md': '# Notes\n\nKeep each note short.\n',
      },
    },
    {
      message: 'Name the test command',
      files: { 'AGENTS.md': '# Agents\n\nRun the tests before every push with bun test.\n' },
    },
    {
      message: 'Widen the notes skill',
      files: {
        'skills/notes/SKILL.md':
          '# Notes\n\nKeep each note short.\n\nPrefer one note for each open question.\n',
      },
      parent: 0,
    },
    {
      message: 'Merge main and name the lint command',
      files: {
        'AGENTS.md':
          '# Agents\n\nRun the tests before every push with bun test.\n\nConsider a lint run after each edit.\n',
      },
      parent: 1,
      merged: 2,
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Name the commands',
    body: 'Names the test and lint commands.',
    baseSha: repo.commits[2] ?? '',
    headSha: repo.commits[3] ?? '',
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","reviews":1,"reported":[],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({});

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));

  expect(result.base).toBe(repo.commits[1] ?? '');

  expect(result.findings.map((finding) => [finding.anchor.path, finding.title])).toStrictEqual([
    ['AGENTS.md', 'Instruction rule leaves a choice open with "consider"'],
  ]);
});

test('it confirms no fix through a merge from the base branch that brings in a source file over the file limit', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/total.ts': 'export const zero = 0;\n',
        'src/table.ts': 'export const table = [];\n',
      },
    },
    {
      message: 'Add the total',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = zero - 1;\n' },
    },
    {
      message: 'Fill the table',
      files: { 'src/table.ts': `export const table = ['${'x'.repeat(300_000)}'];\n` },
      parent: 0,
    },
    {
      message: 'Merge main and add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = zero + 1;\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const findingID = '1111111111111111';

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add the total',
    body: 'Adds one.',
    baseSha: repo.commits[2] ?? '',
    headSha: repo.commits[3] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/total.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/table.ts'],
    isFromBase: true,
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[3] ?? '',
    files: ['src/table.ts', 'src/total.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/total.ts',
    lines: [2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/total.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"${findingID}","title":"Add one, not subtract it","path":"src/total.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[3] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":1,"reported":["${findingID}"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');

  expect(githubCollections.checkRuns.all().at(-1)?.summary).toInclude(
    `no re-review has read the commit ${(repo.commits[3] ?? '').slice(0, 7)} yet`,
  );
});

test('it confirms a fix through a merge from the base branch that brings in a lockfile over the file limit', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/total.ts': 'export const zero = 0;\n', 'bun.lock': '{}\n' },
    },
    {
      message: 'Add the total',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = zero - 1;\n' },
    },
    {
      message: 'Refresh the lockfile',
      files: { 'bun.lock': `{"packages":"${'x'.repeat(300_000)}"}\n` },
      parent: 0,
    },
    {
      message: 'Merge main and add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = zero + 1;\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const findingID = '1111111111111111';

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add the total',
    body: 'Adds one.',
    baseSha: repo.commits[2] ?? '',
    headSha: repo.commits[3] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/total.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['bun.lock'],
    isFromBase: true,
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[3] ?? '',
    files: ['bun.lock', 'src/total.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/total.ts',
    lines: [2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/total.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"${findingID}","title":"Add one, not subtract it","path":"src/total.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[3] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":1,"reported":["${findingID}"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    light: [{ findings: { correctness: [] } }],
    design: [{ findings: { design: [] } }],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it reviews the whole pull request from its merge base under --full', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
    {
      message: 'Add two',
      files: {
        'src/total.ts': 'export const zero = 0;\nexport const one = 1;\nexport const two = 2;\n',
      },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add one and two',
    body: 'Adds one and two.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","reviews":1,"reported":[],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    light: [{ findings: { correctness: [] } }],
  });

  await runCLI(
    ['review', '--pr', '9', '--full', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));

  expect(result.base).toBe(repo.commits[0] ?? '');
});

test('it raises no finding again on a new head that matches a finding answered not-a-defect', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = zero - 1;\n' },
    },
    {
      message: 'Add the counts',
      files: {
        'src/total.ts': [
          'export const zero = 0;',
          ...Array.from({ length: 12 }, (_, index) => `export const count${index} = ${index};`),
          'export const one =  zero - 1;',
          '',
        ].join('\n'),
      },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add one and the counts',
    body: 'Adds one and the counts.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/total.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/total.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/total.ts',
    lines: Array.from({ length: 13 }, (_, index) => index + 2),
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/total.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Add one, not subtract it","path":"src/total.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"criterion":"wrong-behaviour-edge-path","rule":null,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  const reply = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: 'not-a-defect one is the offset below zero',
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":1,"reported":["1111111111111111"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    light: [
      {
        findings: {
          correctness: [
            {
              title: 'Make one equal to zero plus one',
              body: 'The constant is named one but holds -1.',
              anchor: { path: 'src/total.ts', startLine: 14, endLine: 14 },
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
    design: [{ findings: { design: [] } }],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'github', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));

  expect([result.base, result.findings]).toStrictEqual([repo.commits[1] ?? '', []]);

  expect(result.dropped).toStrictEqual([
    {
      lens: 'correctness',
      callID: 'light',
      title: 'Make one equal to zero plus one',
      anchor: { path: 'src/total.ts', startLine: 14, endLine: 14 },
      criterion: 'wrong-behaviour-edge-path',
      reason: 'answered-not-a-defect',
      rule: null,
      ruleQuote: null,
      answeredID: '1111111111111111',
    },
  ]);

  expect(githubCollections.reviewComments.all().map((comment) => comment.id)).toStrictEqual([
    thread.id,
    reply.id,
  ]);

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    headSha: repo.commits[2] ?? '',
    conclusion: 'success',
  });
});

test('it confirms no fix of a finding answered not-a-defect when the review that read the fix dropped a match of it', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = zero - 1;\n' },
    },
    {
      message: 'Add the counts',
      files: {
        'src/total.ts': [
          'export const zero = 0;',
          ...Array.from({ length: 12 }, (_, index) => `export const count${index} = ${index};`),
          'export const one =  zero - 1;',
          '',
        ].join('\n'),
      },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add one and the counts',
    body: 'Adds one and the counts.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/total.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/total.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/total.ts',
    lines: Array.from({ length: 13 }, (_, index) => index + 2),
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/total.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Add one, not subtract it","path":"src/total.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"criterion":"wrong-behaviour-edge-path","rule":null,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: 'not-a-defect one is the offset below zero',
    authorLogin: 'dev',
    inReplyToID: thread.id,
    createdAt: '2026-10-17T10:00:00.000Z',
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":1,"reported":["1111111111111111"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    light: [
      {
        findings: {
          correctness: [
            {
              title: 'Make one equal to zero plus one',
              body: 'The constant is named one but holds -1.',
              anchor: { path: 'src/total.ts', startLine: 14, endLine: 14 },
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
    design: [{ findings: { design: [] } }],
  });

  const context = ctx.buildContext(repo.path, stub.adapter);

  await runCLI(['review', '--pr', '9', '--repo', 'example/app', '--report', 'github'], context);

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
    createdAt: '2026-10-17T11:00:00.000Z',
  });

  await runCLI(['check', '--pr', '9', '--repo', 'example/app'], context);

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    headSha: repo.commits[2] ?? '',
    conclusion: 'failure',
    summary: expect.toInclude('the re-review still finds it'),
  });
});

test('it reviews the whole pull request again at a head a complete review covered under --full', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add one',
    body: 'Adds one.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","reviews":1,"reported":[],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    light: [{ findings: { correctness: [] } }],
    design: [{ findings: { design: [] } }],
  });

  const code = await runCLI(
    ['review', '--pr', '9', '--full', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));

  expect(code).toBe(0);
  expect([result.base, result.head]).toStrictEqual([repo.commits[0] ?? '', repo.commits[1] ?? '']);
});

test('it refuses to review again the head that a review with no failed call covered', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add one',
    body: 'Adds one.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","reviews":1,"reported":[],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({});

  const code = await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'github', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(code).toBe(1);

  expect(ctx.stderr.join('')).toStartWith(
    `noslop: a review with no failed call already covered ${(repo.commits[1] ?? '').slice(0, 12)}, the head of the pull request; push a commit to review it, or pass --full to review the whole change again`,
  );

  expect(stub.requests).toStrictEqual([]);
});

test('it reviews the head again after the review that covered it had a failed call', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add one',
    body: 'Adds one.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","reviews":1,"reported":[],"failedCalls":1} -->`,
  });

  const stub = buildStubAdapter({
    light: [{ findings: { correctness: [] } }],
    design: [{ findings: { design: [] } }],
  });

  const code = await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));

  expect(code).toBe(0);
  expect([result.base, result.head]).toStrictEqual([repo.commits[0] ?? '', repo.commits[1] ?? '']);
});

test('it tells the calls not to judge the description when it reviews only the new commits', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/parse.ts': 'export const parse = 0;\n' } },
    {
      message: 'Add the printer and the cache',
      files: {
        'src/parse.ts': 'export const parse = 0;\n',
        'src/print.ts': 'export const print = 1;\n',
        'src/cache.ts': 'export const cache = 1;\n',
      },
    },
    {
      message: 'Fix the parser',
      files: {
        'src/parse.ts': 'export const parse = 1;\n',
        'src/print.ts': 'export const print = 1;\n',
        'src/cache.ts': 'export const cache = 1;\n',
      },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Add the parser, the printer and the cache',
    body: 'Changes src/parse.ts, src/print.ts and src/cache.ts.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","reviews":1,"reported":[],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    light: [{ findings: { correctness: [] } }],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));

  expect(result.base).toBe(repo.commits[1] ?? '');

  expect(stub.requests[0]?.prompt).toInclude(
    'Do not report that the title or the body misdescribes the change, names a file the change does not touch, or claims work the diff does not show.',
  );
});

test('it runs no design pass on the first review of a pull request', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/parse.ts': 'export const parse = 0;\n' } },
    { message: 'Fix the parser', files: { 'src/parse.ts': 'export const parse = 1;\n' } },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Fix the parser',
    body: 'Parses the header line.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  const stub = buildStubAdapter({
    light: [{ findings: { correctness: [] } }],
    design: [{ findings: { design: [] } }],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(stub.requests.map((request) => request.callID)).toStrictEqual(['light']);
});

test('it runs the design pass on a later review over both rounds of findings, the whole diff and the body, and no linked issue', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Parse the header line',
    body: 'Parses the header line.\n\nFixes #3',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.issues.create({
    owner: 'example',
    repo: 'app',
    number: 3,
    title: 'Parse headers',
    body: 'Text that only the issue holds.',
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 1,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"a1b2c3d4e5f60718","title":"Accept a tab before the header value","path":"src/scan.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: 'fixed 1a2b3c4\nThe scanner now skips a tab.',
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","reviews":1,"reported":["a1b2c3d4e5f60718"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    light: [
      {
        findings: {
          correctness: [
            {
              title: 'Accept a space before the header value',
              body: 'The parser reads a space after the separator as part of the value.',
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
          intent: [],
        },
      },
    ],
    design: [{ findings: { design: [] } }],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const design = stub.requests.find((request) => request.callID === 'design');

  if (design === undefined) {
    throw new Error('the review made no design call');
  }

  expect(stub.requests.map((request) => request.callID)).toStrictEqual(['light', 'design']);
  expect(stub.requests[0]?.prompt).toInclude('Text that only the issue holds.');
  expect(design.prompt).toInclude('Title: Parse the header line\n\nParses the header line.');
  expect(design.prompt).toInclude('"title": "Accept a space before the header value"');
  expect(design.prompt).toInclude('"title": "Accept a tab before the header value"');
  expect(design.prompt).toInclude('"answer": "fixed 1a2b3c4"');
  expect(design.prompt).toInclude('### src/scan.ts (added)');
  expect(design.prompt).toInclude('### src/parse.ts (modified)');
  expect(design.prompt).not.toInclude('Text that only the issue holds.');
  expect(design.prompt).not.toInclude('## Linked issue');
});

test('it confirms no fix of a design finding when the design call fails', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
    {
      message: 'Use the library parser',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "=";\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Parse the header line',
    body: 'Parses the header line.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"2222222222222222","title":"Split the header line with the library parser","path":"src/scan.ts","lens":"design","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":1,"reported":["2222222222222222"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    light: [{ findings: { correctness: [] } }],
    design: [{ error: 'the model CLI timed out' }, { error: 'the model CLI timed out' }],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude('"failedCalls":1');
  expect(summary?.body).toInclude('"confirmed":[]');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it confirms no fix of a design finding when the config turns the design pass off', async () => {
  const ctx = await setupTest();

  const config = '{ "designPass": { "enabled": false, "effort": "medium" } }\n';

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'review.json': config, 'src/scan.ts': 'export const zero = 0;\n' },
    },
    {
      message: 'Add the scanner',
      files: {
        'review.json': config,
        'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n',
      },
    },
    {
      message: 'Use the library parser',
      files: {
        'review.json': config,
        'src/scan.ts': 'export const zero = 0;\nexport const separator = "=";\n',
      },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Parse the header line',
    body: 'Parses the header line.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"2222222222222222","title":"Split the header line with the library parser","path":"src/scan.ts","lens":"design","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":1,"reported":["2222222222222222"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(stub.requests.map((request) => request.callID)).toStrictEqual(['light']);
  expect(summary?.body).toInclude('"confirmed":[]');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it confirms the fix of a design finding when the design call passes and reports it no more', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
    {
      message: 'Use the library parser',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "=";\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Parse the header line',
    body: 'Parses the header line.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"2222222222222222","title":"Split the header line with the library parser","path":"src/scan.ts","lens":"design","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":1,"reported":["2222222222222222"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    light: [{ findings: { correctness: [] } }],
    design: [{ findings: { design: [] } }],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(
    `"confirmed":["2222222222222222:${(repo.commits[2] ?? '').slice(0, 7)}"]`,
  );

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it keeps a description finding when it reviews the whole pull request', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/parse.ts': 'export const parse = 0;\n' } },
    { message: 'Fix the parser', files: { 'src/parse.ts': 'export const parse = 1;\n' } },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Fix the parser and the printer',
    body: 'Changes src/parse.ts and src/print.ts.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  const stub = buildStubAdapter({
    light: [
      {
        findings: {
          correctness: [
            {
              title: 'Change src/print.ts, or drop it from the body',
              body: 'The body names src/print.ts, which the pull request does not change.',
              anchor: { path: 'src/parse.ts', startLine: 1, endLine: 1 },
              secondLocation: null,
              severity: 'P2',
              criterion: 'intent-mismatch',
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

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));
  const prompt = stub.requests[0]?.prompt;

  if (prompt === undefined) {
    throw new Error('the review made no call');
  }

  expect(result.findings).toPartiallyContain({
    title: 'Change src/print.ts, or drop it from the body',
    criterion: 'intent-mismatch',
  });

  expect(prompt).not.toInclude('## Incremental review');
});

test('it refuses --full without --pr', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
  ]);

  const code = await runCLI(
    ['review', '--full'],
    ctx.buildContext(repo.path, buildStubAdapter({}).adapter),
  );

  expect(code).toBe(1);

  expect(ctx.stderr.join('')).toStartWith(
    'noslop: --full takes --pr; a review without --pr covers the whole change',
  );
});

test('it refuses --fixes-only without --pr', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
  ]);

  const code = await runCLI(
    ['review', '--fixes-only'],
    ctx.buildContext(repo.path, buildStubAdapter({}).adapter),
  );

  expect(code).toBe(1);

  expect(ctx.stderr.join('')).toStartWith(
    'noslop: --fixes-only takes --pr; it confirms the fixes of an earlier review',
  );
});

test('it refuses --fixes-only beside --full', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
  ]);

  const code = await runCLI(
    ['review', '--pr', '9', '--fixes-only', '--full'],
    ctx.buildContext(repo.path, buildStubAdapter({}).adapter),
  );

  expect(code).toBe(1);

  expect(ctx.stderr.join('')).toStartWith(
    'noslop: --fixes-only reviews only the commits since the last review; leave out --full',
  );
});

test('it refuses --fixes-only on a pull request that no review covered yet', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  const stub = buildStubAdapter({});

  const code = await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(code).toBe(1);

  expect(ctx.stderr.join('')).toStartWith(
    'noslop: --fixes-only needs an earlier review with no failed call whose head the branch still holds',
  );

  expect(githubCollections.checkRuns.all()).toStrictEqual([]);
});

test('it confirms a fixed reply under --fixes-only and posts nothing new', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Scan the header line',
    body: 'Scans the header line.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Reject an empty separator","path":"src/scan.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":2,"reported":["1111111111111111"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'The separator is a colon now.' }],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(
    `"confirmed":["1111111111111111:${(repo.commits[2] ?? '').slice(0, 7)}"]`,
  );

  expect(summary?.body).toInclude('"reviews":2,');
  expect(githubCollections.reviews.all()).toStrictEqual([]);
  expect(githubCollections.reviewComments.all()).toHaveLength(2);
  expect(githubCollections.issueComments.all()).toHaveLength(1);
  expect(githubCollections.issues.all()).toStrictEqual([]);
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it confirms a fixed reply under --fixes-only in a thread of the App the config names, with a token', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'review.json': JSON.stringify({ github: { app: 'example-reviewer' } }),
        'src/scan.ts': 'export const zero = 0;\n',
      },
    },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Scan the header line',
    body: 'Scans the header line.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: 'example-reviewer[bot]',
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Reject an empty separator","path":"src/scan.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: 'example-reviewer[bot]',
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":2,"reported":["1111111111111111"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'The separator is a colon now.' }],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'json', '--json'],
    ctx.buildContext(
      repo.path,
      stub.adapter,
      createGitHubConnectionLoader({ GH_TOKEN: 'ghp_reader' }),
    ),
  );

  const result = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));

  expect(result.fixChecks).toStrictEqual([
    { findingID: '1111111111111111', fixed: true, reason: 'The separator is a colon now.' },
  ]);
});

test('it confirms a fixed reply under --fixes-only from the branch commit a rebase made of the reviewed head', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    { message: 'Describe the app', parent: 0, files: { 'README.md': '# app\n' } },
    {
      message: 'Add the scanner',
      parent: 0,
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Add the scanner',
      parent: 1,
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Scan the header line',
    body: 'Scans the header line.',
    baseSha: repo.commits[1] ?? '',
    headSha: repo.commits[4] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[3] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[4] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Reject an empty separator","path":"src/scan.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[2] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[4] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[2] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":2,"reported":["1111111111111111"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'The separator is a colon now.' }],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(
    `"confirmed":["1111111111111111:${(repo.commits[4] ?? '').slice(0, 7)}"]`,
  );

  expect(summary?.body).toInclude(`"base":"${repo.commits[3] ?? ''}"`);
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it confirms a fixed reply under --fixes-only that names a fix commit the rebase rewrote', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    { message: 'Describe the app', parent: 0, files: { 'README.md': '# app\n' } },
    {
      message: 'Add the scanner',
      parent: 0,
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
    {
      message: 'Add the scanner',
      parent: 1,
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Scan the header line',
    body: 'Scans the header line.',
    baseSha: repo.commits[1] ?? '',
    headSha: repo.commits[5] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.ts'],
    isOnBranch: false,
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[3] ?? '',
    files: ['src/scan.ts'],
    patches: {
      'src/scan.ts':
        '@@ -2,1 +2,1 @@\n-export const separator = "";\n+export const separator = ":";',
    },
    isOnBranch: false,
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[4] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[5] ?? '',
    files: ['src/scan.ts'],
    patches: {
      'src/scan.ts':
        '@@ -2,1 +2,1 @@\n-export const separator = "";\n+export const separator = ":";',
    },
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Reject an empty separator","path":"src/scan.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[2] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[3] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[2] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":2,"reported":["1111111111111111"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'The separator is a colon now.' }],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(
    `"confirmed":["1111111111111111:${(repo.commits[3] ?? '').slice(0, 7)}"]`,
  );

  expect(summary?.body).toInclude(`"base":"${repo.commits[4] ?? ''}"`);
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it refuses --fixes-only when a rebase changed the patch of a reviewed commit, and gives the commit', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Rename the zero constant',
      parent: 0,
      files: { 'src/scan.ts': 'export const none = 0;\n' },
    },
    {
      message: 'Add the scanner',
      parent: 0,
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Add the scanner',
      parent: 1,
      files: { 'src/scan.ts': 'export const none = 0;\nexport const separator = "";\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    baseSha: repo.commits[1] ?? '',
    headSha: repo.commits[3] ?? '',
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[2] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":1,"reported":[],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({});

  const code = await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(code).toBe(1);

  expect(ctx.stderr.join('')).toStartWith(
    `noslop: --fixes-only needs an earlier review with no failed call whose head the branch still holds: the rebase changed the patch of the reviewed commit ${(repo.commits[2] ?? '').slice(0, 12)}`,
  );

  expect(githubCollections.checkRuns.all()).toStrictEqual([]);
});

test('it carries the last review under --fixes-only onto a clean rebase with no new commit, so the check passes at the new head', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    { message: 'Describe the app', parent: 0, files: { 'README.md': '# app\n' } },
    {
      message: 'Add the scanner',
      parent: 0,
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
    {
      message: 'Add the scanner',
      parent: 1,
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Scan the header line',
    body: 'Scans the header line.',
    baseSha: repo.commits[1] ?? '',
    headSha: repo.commits[5] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.ts'],
    isOnBranch: false,
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[3] ?? '',
    files: ['src/scan.ts'],
    patches: {
      'src/scan.ts':
        '@@ -2,1 +2,1 @@\n-export const separator = "";\n+export const separator = ":";',
    },
    isOnBranch: false,
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[4] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[5] ?? '',
    files: ['src/scan.ts'],
    patches: {
      'src/scan.ts':
        '@@ -2,1 +2,1 @@\n-export const separator = "";\n+export const separator = ":";',
    },
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [1, 2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Reject an empty separator","path":"src/scan.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[2] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${repo.commits[3] ?? ''}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  const other = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 1,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"2222222222222222","title":"Name the zero constant","path":"src/scan.ts","lens":"naming-shape-and-comments","severity":"P3","riskClass":null,"writtenByChange":false,"head":"${repo.commits[2] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: 'not-a-defect the name matches the protocol field',
    authorLogin: 'dev',
    inReplyToID: other.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[3] ?? ''}","base":"${repo.commits[2] ?? ''}","notReviewed":[],"checked":["1111111111111111"],"earlier":[{"base":"${repo.commits[0] ?? ''}","head":"${repo.commits[2] ?? ''}","reported":["1111111111111111","2222222222222222"],"notReviewed":[]}],"reviews":1,"reported":[],"failedCalls":0,"confirmed":["1111111111111111:${repo.commits[3] ?? ''}"]} -->`,
  });

  const stub = buildStubAdapter({});
  const context = ctx.buildContext(repo.path, stub.adapter);

  const code = await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    context,
  );

  await runCLI(['check', '--pr', '9', '--repo', 'example/app'], context);

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(code).toBe(0);
  expect(stub.requests).toStrictEqual([]);
  expect(summary?.body).toInclude(`{"head":"${repo.commits[5] ?? ''}"`);
  expect(summary?.body).toInclude('"reviews":1,');

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    headSha: repo.commits[5] ?? '',
    conclusion: 'success',
  });
});

test('it checks the resolution of a merge with a conflict under --fixes-only and marks the merge as checked', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/options.ts': 'export const options = { retries: 1, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Retry 3 times',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Wait longer',
      files: { 'src/options.ts': 'export const options = { retries: 1, timeoutMs: 5000 };\n' },
      parent: 0,
    },
    {
      message: 'Merge main',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 5000 };\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const merge = repo.commits[3] ?? '';

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Retry a failed request',
    body: 'Retries a failed request 3 times.',
    baseSha: repo.commits[2] ?? '',
    headSha: merge,
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/options.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: merge,
    files: ['src/options.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/options.ts',
    lines: [1],
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":2,"reported":[],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    [`resolution-${merge.slice(0, 12)}`]: [
      {
        sound: true,
        reason: 'The merge keeps 3 retries and the 5000 ms timeout.',
        findings: { correctness: [], security: [] },
      },
    ],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(`"checkedMerges":["${merge}"]`);
  expect(summary?.body).toInclude('"reviews":2,');
  expect(githubCollections.reviews.all()).toStrictEqual([]);
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it posts the finding of a resolution that drops a change under --fixes-only, fails the check and counts no review', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'src/options.ts': 'export const options = { retries: 1, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Retry 3 times',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 1000 };\n' },
    },
    {
      message: 'Wait longer',
      files: { 'src/options.ts': 'export const options = { retries: 1, timeoutMs: 5000 };\n' },
      parent: 0,
    },
    {
      message: 'Merge main',
      files: { 'src/options.ts': 'export const options = { retries: 3, timeoutMs: 1000 };\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  const merge = repo.commits[3] ?? '';

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Retry a failed request',
    body: 'Retries a failed request 3 times.',
    baseSha: repo.commits[2] ?? '',
    headSha: merge,
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/options.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: merge,
    files: ['src/options.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/options.ts',
    lines: [1],
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":2,"reported":[],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    [`resolution-${merge.slice(0, 12)}`]: [
      {
        sound: false,
        reason: 'The resolution drops the 5000 ms timeout the base branch set.',
        findings: {
          correctness: [
            {
              title: 'Keep the 5000 ms timeout from the base branch',
              body: 'The base branch raised the timeout to 5000 ms, and the resolution keeps 1000 ms, so slow requests fail again.',
              anchor: { path: 'src/options.ts', startLine: 1, endLine: 1 },
              secondLocation: null,
              severity: 'P1',
              criterion: 'wrong-result-main-path',
              rule: null,
              ruleQuote: null,
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: 'Set timeoutMs to 5000.',
            },
          ],
          security: [],
        },
      },
    ],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  const comments = githubCollections.reviewComments.all();

  expect(comments.map((comment) => [comment.path, comment.line])).toStrictEqual([
    ['src/options.ts', 1],
  ]);

  expect(comments[0]?.body).toInclude('Keep the 5000 ms timeout from the base branch');
  expect(summary?.body).toInclude('"reviews":2,');
  expect(summary?.body).not.toInclude('checkedMerges');
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('failure');
});

test('it rejects a fixed reply under --fixes-only when the call finds the fix does not fix the finding, and fails the check', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Rename the zero constant',
      files: { 'src/scan.ts': 'export const none = 0;\nexport const separator = "";\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Scan the header line',
    body: 'Scans the header line.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [1, 2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Reject an empty separator","path":"src/scan.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":2,"reported":["1111111111111111"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    'fix-1111111111111111': [
      { fixed: false, reason: 'The commit renames a constant and leaves the empty separator.' },
    ],
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(
    `❌ Reject an empty separator: not fixed in \`${(repo.commits[2] ?? '').slice(0, 7)}\` (The commit renames a constant and leaves the empty separator.)`,
  );

  expect(summary?.body).toInclude('"confirmed":[]');
  expect(githubCollections.reviewComments.all()).toHaveLength(2);

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    headSha: repo.commits[2] ?? '',
    conclusion: 'failure',
    summary: expect.toInclude(
      '`1111111111111111` Reject an empty separator: the re-review still finds it',
    ),
  });
});

test('it confirms a fixed reply to a static finding under --fixes-only when its fix removes the problem, and posts nothing new', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const split = (line: string) => line;\n' } },
    {
      message: 'Test the scanner',
      files: {
        'src/scan.test.ts':
          "import { test } from 'bun:test';\nimport { split } from './scan';\n\ntest('it splits on the separator', () => {\n  split('a:b');\n});\n",
      },
    },
    {
      message: 'Assert the split',
      files: {
        'src/scan.test.ts':
          "import { expect, test } from 'bun:test';\nimport { split } from './scan';\n\ntest('it splits on the separator', () => {\n  expect(split('a:b')).toBe('a:b');\n});\n",
      },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Test the scanner',
    body: 'Tests the scanner.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/scan.test.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.test.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.test.ts',
    lines: [1, 2, 3, 4, 5, 6],
  });

  // the ID the static stage gives the unasserted test
  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.test.ts',
    line: 4,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"f3a135d185244d40","title":"Test \\"it splits on the separator\\" asserts nothing","path":"src/scan.test.ts","lens":"static","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":1,"reported":["f3a135d185244d40"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({});

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(
    `"confirmed":["f3a135d185244d40:${(repo.commits[2] ?? '').slice(0, 7)}"]`,
  );

  expect(stub.requests).toStrictEqual([]);
  expect(githubCollections.reviews.all()).toStrictEqual([]);
  expect(githubCollections.reviewComments.all()).toHaveLength(2);
  expect(githubCollections.issueComments.all()).toHaveLength(1);
  expect(githubCollections.issues.all()).toStrictEqual([]);
  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it rejects a fixed reply to a static finding under --fixes-only when the static check still reports it, and fails the check', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const split = (line: string) => line;\n' } },
    {
      message: 'Test the scanner',
      files: {
        'src/scan.test.ts':
          "import { test } from 'bun:test';\nimport { split } from './scan';\n\ntest('it splits on the separator', () => {\n  split('a:b');\n});\n",
      },
    },
    {
      message: 'Split a longer line',
      files: {
        'src/scan.test.ts':
          "import { test } from 'bun:test';\nimport { split } from './scan';\n\ntest('it splits on the separator', () => {\n  split('a:b:c');\n});\n",
      },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Test the scanner',
    body: 'Tests the scanner.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/scan.test.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.test.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.test.ts',
    lines: [1, 2, 3, 4, 5, 6],
  });

  // the ID the static stage gives the unasserted test
  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.test.ts',
    line: 4,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"f3a135d185244d40","title":"Test \\"it splits on the separator\\" asserts nothing","path":"src/scan.test.ts","lens":"static","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":1,"reported":["f3a135d185244d40"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({});

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(
    `❌ Test "it splits on the separator" asserts nothing: not fixed in \`${(repo.commits[2] ?? '').slice(0, 7)}\` (the static check still reports it at the head)`,
  );

  expect(summary?.body).toInclude('"confirmed":[]');
  expect(stub.requests).toStrictEqual([]);
  expect(githubCollections.reviewComments.all()).toHaveLength(2);

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    headSha: repo.commits[2] ?? '',
    conclusion: 'failure',
    summary: expect.toInclude(
      '`f3a135d185244d40` Test "it splits on the separator" asserts nothing: the re-review still finds it',
    ),
  });
});

test('it rejects a fixed reply to a format-only finding under --fixes-only by the linked issue, when the fix leaves the hunk', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'src/scan.ts':
          'export const zero=0;\nexport const one = 1;\nexport const two = 2;\nexport const three = 3;\nexport const four = 4;\nexport const five = 5;\nexport const six = 6;\nexport const seven = 7;\nexport const eight = 8;\nexport const nine = 9;\n',
      },
    },
    {
      message: 'Space the zero constant',
      files: {
        'src/scan.ts':
          'export const zero = 0;\nexport const one = 1;\nexport const two = 2;\nexport const three = 3;\nexport const four = 4;\nexport const five = 5;\nexport const six = 6;\nexport const seven = 7;\nexport const eight = 8;\nexport const nine = 9;\n',
      },
    },
    {
      message: 'Raise the last constant',
      files: {
        'src/scan.ts':
          'export const zero = 0;\nexport const one = 1;\nexport const two = 2;\nexport const three = 3;\nexport const four = 4;\nexport const five = 5;\nexport const six = 6;\nexport const seven = 7;\nexport const eight = 8;\nexport const nine = 10;\n',
      },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Count the header fields',
    body: 'Fixes #3',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.issues.create({
    owner: 'example',
    repo: 'app',
    number: 3,
    title: 'Count the header fields',
    body: 'The parser in src/header.ts counts no fields.',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [1, 10],
  });

  // the ID the static stage gives the format-only hunk
  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 1,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"822c3dcaa0cd615c","title":"Format-only edit to scan.ts, outside the linked issue","path":"src/scan.ts","lens":"static","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":1,"reported":["822c3dcaa0cd615c"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({});

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(
    `❌ Format-only edit to scan.ts, outside the linked issue: not fixed in \`${(repo.commits[2] ?? '').slice(0, 7)}\` (the static check still reports it at the head)`,
  );

  expect(stub.requests).toStrictEqual([]);

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    headSha: repo.commits[2] ?? '',
    conclusion: 'failure',
    summary: expect.toInclude(
      '`822c3dcaa0cd615c` Format-only edit to scan.ts, outside the linked issue: the re-review still finds it',
    ),
  });
});

test('it makes one call per fixed reply under --fixes-only, no lens call, and judges each fix in a file on its own', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Scan the header line',
    body: 'Scans the header line.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Reject an empty separator","path":"src/scan.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":2,"reported":["1111111111111111"],"failedCalls":0} -->`,
  });

  const other = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 1,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"2222222222222222","title":"Name the zero constant","path":"src/scan.ts","lens":"naming-shape-and-comments","severity":"P3","riskClass":null,"writtenByChange":false,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: 'not-a-defect the name matches the protocol field',
    authorLogin: 'dev',
    inReplyToID: other.id,
  });

  const trim = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"3333333333333333","title":"Trim the separator before the split","path":"src/scan.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: trim.id,
  });

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'The separator is a colon now.' }],
    'fix-3333333333333333': [{ fixed: false, reason: 'The split still keeps the spaces.' }],
  });

  await runCLI(
    [
      'review',
      '--pr',
      '9',
      '--repo',
      'example/app',
      '--fixes-only',
      '--report',
      'github',
      '--json',
    ],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const output = reviewResultSchema.parse(JSON.parse(ctx.stdout.join('')));

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(stub.requests.map((request) => request.callID)).toIncludeSameMembers([
    'fix-1111111111111111',
    'fix-3333333333333333',
  ]);

  expect(output.lenses).toStrictEqual([]);
  expect(output.findings).toStrictEqual([]);

  expect(output.fixChecks).toIncludeSameMembers([
    { findingID: '1111111111111111', fixed: true, reason: 'The separator is a colon now.' },
    { findingID: '3333333333333333', fixed: false, reason: 'The split still keeps the spaces.' },
  ]);

  expect(summary?.body).toInclude(
    `"confirmed":["1111111111111111:${(repo.commits[2] ?? '').slice(0, 7)}"]`,
  );
});

test('it confirms no fixed reply posted after a --fixes-only review that never checked it', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Scan the header line',
    body: 'Scans the header line.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Reject an empty separator","path":"src/scan.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":2,"reported":["1111111111111111","2222222222222222"],"failedCalls":0} -->`,
  });

  // a second finding whose fix the first fixes-only run checks
  const checked = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"2222222222222222","title":"Name the separator","path":"src/scan.ts","lens":"design","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: checked.id,
  });

  const stub = buildStubAdapter({
    'fix-2222222222222222': [{ fixed: true, reason: 'The separator has a name now.' }],
  });

  const context = ctx.buildContext(repo.path, stub.adapter);

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    context,
  );

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await runCLI(['check', '--pr', '9', '--repo', 'example/app'], context);

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    headSha: repo.commits[2] ?? '',
    conclusion: 'failure',
    summary: expect.toInclude(
      `\`1111111111111111\` Reject an empty separator: no re-review has read the commit ${(repo.commits[2] ?? '').slice(0, 7)} yet`,
    ),
  });
});

test('it keeps a fixed reply posted after 2 --fixes-only reviews open until a --fixes-only review checks it', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
    { message: 'Add a tab', files: { 'src/tab.ts': 'export const tab = "\\t";\n' } },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Scan the header line',
    body: 'Scans the header line.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[3] ?? '',
    files: ['src/tab.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Reject an empty separator","path":"src/scan.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":2,"reported":["1111111111111111","2222222222222222","3333333333333333"],"failedCalls":0} -->`,
  });

  // a finding whose fix the first fixes-only run checks
  const first = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"2222222222222222","title":"Name the separator","path":"src/scan.ts","lens":"design","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: first.id,
  });

  // a finding whose fix the second fixes-only run checks
  const second = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"3333333333333333","title":"Define the tab","path":"src/scan.ts","lens":"design","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/tab.ts',
    lines: [1],
  });

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'The separator is a colon now.' }],
    'fix-2222222222222222': [{ fixed: true, reason: 'The separator has a name now.' }],
    'fix-3333333333333333': [{ fixed: true, reason: 'The tab is defined now.' }],
  });

  const context = ctx.buildContext(repo.path, stub.adapter);

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    context,
  );

  await githubCollections.pullRequests.update((query) => query.where({ number: 9 }), {
    data(record) {
      record.headSha = repo.commits[3] ?? '';
    },
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[3] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: second.id,
  });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    context,
  );

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await runCLI(['check', '--pr', '9', '--repo', 'example/app'], context);

  const before = githubCollections.checkRuns.all().at(-1);

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    context,
  );

  expect(before).toMatchObject({
    conclusion: 'failure',
    summary: expect.toInclude(
      `\`1111111111111111\` Reject an empty separator: no re-review has read the commit ${(repo.commits[2] ?? '').slice(0, 7)} yet`,
    ),
  });

  expect(stub.requests.map((request) => request.callID)).toStrictEqual([
    'fix-2222222222222222',
    'fix-3333333333333333',
    'fix-1111111111111111',
  ]);

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    headSha: repo.commits[3] ?? '',
    conclusion: 'success',
  });
});

test('it refuses --fixes-only with no fixed answer to check, so the summary stays on its head and the check fails at the new head', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
    { message: 'Add a tab', files: { 'src/tab.ts': 'export const tab = "\\t";\n' } },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Scan the header line',
    body: 'Scans the header line.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[3] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[3] ?? '',
    files: ['src/tab.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Reject an empty separator","path":"src/scan.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  // the summary of a fixes-only run that confirmed the fix
  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[2] ?? ''}","base":"${repo.commits[1] ?? ''}","notReviewed":[],"checked":["1111111111111111"],"earlier":[{"base":"${repo.commits[0] ?? ''}","head":"${repo.commits[1] ?? ''}","reported":["1111111111111111"],"notReviewed":[]}],"reviews":2,"reported":[],"failedCalls":0,"confirmed":["1111111111111111:${(repo.commits[2] ?? '').slice(0, 7)}"]} -->`,
  });

  const stub = buildStubAdapter({});
  const context = ctx.buildContext(repo.path, stub.adapter);

  const code = await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    context,
  );

  const stderr = ctx.stderr.join('');

  await runCLI(['check', '--pr', '9', '--repo', 'example/app'], context);

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect({ code, stderr }).toStrictEqual({
    code: 1,
    stderr: `noslop: --fixes-only has no \`fixed\` answer to check, so it cannot pass ${(repo.commits[3] ?? '').slice(0, 12)}, which no lens read and which is no merge of the base; run a review without --fixes-only\n`,
  });

  expect(stub.requests).toStrictEqual([]);
  expect(summary?.body).toInclude(`{"head":"${repo.commits[2] ?? ''}"`);

  expect(githubCollections.checkRuns.all()).toMatchObject([
    {
      headSha: repo.commits[3] ?? '',
      conclusion: 'failure',
      title: `No noslop review for this commit, ${(repo.commits[3] ?? '').slice(0, 12)}.`,
    },
  ]);
});

test('it bases a --fixes-only review on the last head with no failed call after a fix check failed', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
    { message: 'Add a tab', files: { 'src/tab.ts': 'export const tab = "\\t";\n' } },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Scan the header line',
    body: 'Scans the header line.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[3] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[3] ?? '',
    files: ['src/tab.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Reject an empty separator","path":"src/scan.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  // the summary of a fixes-only run at the fix whose call failed, over the review before it
  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[2] ?? ''}","base":"${repo.commits[1] ?? ''}","earlier":[{"base":"${repo.commits[0] ?? ''}","head":"${repo.commits[1] ?? ''}","reported":["1111111111111111"],"notReviewed":[]}],"reviews":2,"reported":[],"failedCalls":1,"checked":[]} -->`,
  });

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'The separator is a colon now.' }],
  });

  const code = await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(code).toBe(0);

  expect(summary?.body).toInclude(
    `{"head":"${repo.commits[3] ?? ''}","base":"${repo.commits[1] ?? ''}"`,
  );

  expect(githubCollections.checkRuns.all().at(-1)?.conclusion).toBe('success');
});

test('it moves the summary head to the head a --fixes-only review read, so the check reads the current head', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/scan.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add the scanner',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = "";\n' },
    },
    {
      message: 'Reject an empty separator',
      files: { 'src/scan.ts': 'export const zero = 0;\nexport const separator = ":";\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    title: 'Scan the header line',
    body: 'Scans the header line.',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[1] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullCommits.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    sha: repo.commits[2] ?? '',
    files: ['src/scan.ts'],
  });

  await githubCollections.pullFiles.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    lines: [2],
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Reject an empty separator","path":"src/scan.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${repo.commits[1] ?? ''}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: `fixed ${(repo.commits[2] ?? '').slice(0, 7)}`,
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${repo.commits[1] ?? ''}","base":"${repo.commits[0] ?? ''}","reviews":2,"reported":["1111111111111111"],"failedCalls":0} -->`,
  });

  const stub = buildStubAdapter({
    'fix-1111111111111111': [{ fixed: true, reason: 'The separator is a colon now.' }],
  });

  const context = ctx.buildContext(repo.path, stub.adapter);

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--fixes-only', '--report', 'github'],
    context,
  );

  ctx.stderr.length = 0;

  const code = await runCLI(['check', '--pr', '9', '--repo', 'example/app'], context);

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude(`{"head":"${repo.commits[2] ?? ''}"`);
  expect({ code, stderr: ctx.stderr.join('') }).toStrictEqual({ code: 0, stderr: '' });

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    headSha: repo.commits[2] ?? '',
    conclusion: 'success',
  });
});

test('it records an escape in the store and counts it in recall', async () => {
  const ctx = await setupTest();

  const context = ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter);

  await runCLI(
    [
      'store',
      'escape',
      '--repo',
      'example/app',
      '--issue',
      '#12',
      '--head',
      'b'.repeat(40),
      '--defect',
      'The total skips the first item',
      '--lens',
      'correctness',
      '--path',
      'src/a.ts',
      '--lines',
      '4-6',
    ],
    context,
  );

  ctx.stdout.length = 0;

  const code = await runCLI(['store', 'query', 'recall-by-lens', '--json'], context);

  const rows: unknown = JSON.parse(ctx.stdout.join(''));

  expect(code).toBe(0);
  expect(rows).toStrictEqual([{ lens: 'correctness', escapes: 1, lensRan: 0, lensReported: 0 }]);
});

test('it refuses escape lines that are no line range', async () => {
  const ctx = await setupTest();

  const code = await runCLI(
    [
      'store',
      'escape',
      '--repo',
      'example/app',
      '--issue',
      '#12',
      '--head',
      'b'.repeat(40),
      '--defect',
      'The total skips the first item',
      '--path',
      'src/a.ts',
      '--lines',
      'four',
    ],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  expect(code).toBe(1);

  expect(ctx.stderr.join('')).toBe(
    'noslop: --lines takes a line or a range such as 12-14, not four\n',
  );
});

test('it records the dispositions of a pull request in the store when it sets the check', async () => {
  const ctx = await setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    headSha: 'b'.repeat(40),
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: '<!-- noslop:finding {"id":"1111111111111111","title":"Await the write","path":"src/a.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true} -->',
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: 'dev',
    inReplyToID: thread.id,
    body: 'not-a-defect the caller awaits it',
  });

  await runCLI(
    ['check', '--pr', '9', '--repo', 'example/app'],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  const store = await loadStore(join(ctx.directory, 'data', 'store.sqlite'));

  onTestFinished(() => store.destroy());

  const rows = await store
    .selectFrom('dispositions')
    .select(['finding_id', 'pull_request', 'kind', 'value'])
    .execute();

  expect(rows).toStrictEqual([
    {
      finding_id: '1111111111111111',
      pull_request: 9,
      kind: 'not-a-defect',
      value: 'the caller awaits it',
    },
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
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  const outcome: unknown = JSON.parse(ctx.stdout.join(''));

  expect(code).toBe(0);
  expect(outcome).toMatchObject({ conclusion: 'success' });
  expect(githubCollections.checkRuns.all()).toMatchObject([{ conclusion: 'success' }]);
});

test('it verifies a pull request review against its head and the config of its base branch', async () => {
  const ctx = await setupTest();

  const config = '{ "extends": "github:example/shared", "rules": ["rules/taste.md"] }\n';
  const taste = 'Name each total for what it sums.\n';
  const parent = '{ "lenses": { "correctness": { "model": "shared-model" } } }\n';

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'review.json': config,
        'rules/taste.md': taste,
        'src/a.ts': 'export const a = 1;\n',
      },
    },
    { message: 'Change a', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    baseRef: 'main',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'main',
    sha: repo.commits[0] ?? '',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: repo.commits[0] ?? '',
    path: 'review.json',
    content: config,
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: repo.commits[0] ?? '',
    path: 'rules/taste.md',
    content: taste,
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'shared',
    ref: 'main',
    path: 'review.json',
    content: parent,
  });

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const reviewed = reviewResultSchema.parse(JSON.parse(ctx.stdout.splice(0).join('')));

  await Bun.write(join(ctx.directory, 'result.json'), JSON.stringify(reviewed));

  const code = await runCLI(
    ['verify', join(ctx.directory, 'result.json'), '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  const verified: unknown = JSON.parse(ctx.stdout.join(''));

  expect({ code, stderr: ctx.stderr.join('') }).toStrictEqual({ code: 0, stderr: '' });

  expect(verified).toStrictEqual({
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    head: repo.commits[1] ?? '',
    configHash: reviewed.configHash,
  });
});

test('it refuses a result whose head is no longer the head of the pull request', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'review.json': '{}\n', 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'Change a', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'main',
    sha: repo.commits[0] ?? '',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: repo.commits[0] ?? '',
    path: 'review.json',
    content: '{}\n',
  });

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  await Bun.write(join(ctx.directory, 'result.json'), ctx.stdout.splice(0).join(''));

  await githubCollections.pullRequests.update((query) => query.where({ number: 9 }), {
    data(record) {
      record.headSha = 'c'.repeat(40);
    },
  });

  const code = await runCLI(
    ['verify', join(ctx.directory, 'result.json')],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect({ code, stderr: ctx.stderr.join('') }).toStrictEqual({
    code: 1,
    stderr: `noslop: the result does not verify: it reviews ${(repo.commits[1] ?? '').slice(0, 12)}, but the head of the pull request is cccccccccccc\n`,
  });
});

test('it refuses a result when the config on the base branch changed after the review', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'review.json': '{}\n', 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'Change a', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'main',
    sha: repo.commits[0] ?? '',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: repo.commits[0] ?? '',
    path: 'review.json',
    content: '{ "lenses": { "correctness": { "model": "stricter-model" } } }\n',
  });

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  await Bun.write(join(ctx.directory, 'result.json'), ctx.stdout.splice(0).join(''));

  const code = await runCLI(
    ['verify', join(ctx.directory, 'result.json')],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(code).toBe(1);

  expect(ctx.stderr.join('')).toMatch(
    /^noslop: the result does not verify: its config hash [0-9a-f]{16} differs from [0-9a-f]{16}, the hash of the config on main\n$/u,
  );
});

test('it refuses a result that matches the config at the pull request base when the base branch moved on to a new config', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'review.json': '{}\n', 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'Change a', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'main',
    sha: 'e'.repeat(40),
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: repo.commits[0] ?? '',
    path: 'review.json',
    content: '{}\n',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'e'.repeat(40),
    path: 'review.json',
    content: '{ "lenses": { "correctness": { "model": "stricter-model" } } }\n',
  });

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  await Bun.write(join(ctx.directory, 'result.json'), ctx.stdout.splice(0).join(''));

  const code = await runCLI(
    ['verify', join(ctx.directory, 'result.json')],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(code).toBe(1);

  expect(ctx.stderr.join('')).toMatch(
    /^noslop: the result does not verify: its config hash [0-9a-f]{16} differs from [0-9a-f]{16}, the hash of the config on main\n$/u,
  );
});

test('it refuses a result when the parent config the base branch extends changed after the review', async () => {
  const ctx = await setupTest();

  const config = '{ "extends": "github:example/shared" }\n';

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'review.json': config, 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'Change a', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'main',
    sha: repo.commits[0] ?? '',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: repo.commits[0] ?? '',
    path: 'review.json',
    content: config,
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'shared',
    ref: 'main',
    path: 'review.json',
    content: '{ "lenses": { "correctness": { "model": "shared-model" } } }\n',
  });

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  await Bun.write(join(ctx.directory, 'result.json'), ctx.stdout.splice(0).join(''));

  await githubCollections.files.update((query) => query.where({ repo: 'shared' }), {
    data(record) {
      record.content = '{ "lenses": { "correctness": { "model": "other-model" } } }\n';
    },
  });

  const code = await runCLI(
    ['verify', join(ctx.directory, 'result.json')],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect(code).toBe(1);

  expect(ctx.stderr.join('')).toMatch(
    /^noslop: the result does not verify: its config hash [0-9a-f]{16} differs from [0-9a-f]{16}, the hash of the config on main\n$/u,
  );
});

test('it verifies a result against the config of the base branch the pull request names', async () => {
  const ctx = await setupTest();

  const release = '{ "lenses": { "correctness": { "model": "release-model" } } }\n';
  const main = '{ "lenses": { "correctness": { "model": "main-model" } } }\n';

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'review.json': release, 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'Change a', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    baseRef: 'release',
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'release',
    sha: 'e'.repeat(40),
  });

  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'main',
    sha: 'f'.repeat(40),
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'e'.repeat(40),
    path: 'review.json',
    content: release,
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'f'.repeat(40),
    path: 'review.json',
    content: main,
  });

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  await Bun.write(join(ctx.directory, 'result.json'), ctx.stdout.splice(0).join(''));

  const code = await runCLI(
    ['verify', join(ctx.directory, 'result.json')],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect({ code, stderr: ctx.stderr.join('') }).toStrictEqual({ code: 0, stderr: '' });
});

test('it refuses to verify when no result file is named', async () => {
  const ctx = await setupTest();

  const code = await runCLI(
    ['verify'],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  expect({ code, stderr: ctx.stderr.join('') }).toStrictEqual({
    code: 1,
    stderr: "noslop: Positional argument 'file' is required\n",
  });
});

test('it refuses to verify a result file that does not exist', async () => {
  const ctx = await setupTest();

  const code = await runCLI(
    ['verify', 'missing.json'],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  expect({ code, stderr: ctx.stderr.join('') }).toStrictEqual({
    code: 1,
    stderr: 'noslop: no review result file at missing.json\n',
  });
});

test('it refuses to verify a result file that is not valid JSON', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.directory, 'result.json'), '{ "version": ');

  const code = await runCLI(
    ['verify', 'result.json'],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  expect({ code, stderr: ctx.stderr.join('') }).toStrictEqual({
    code: 1,
    stderr: 'noslop: the review result file result.json is not valid JSON\n',
  });
});

test('it refuses a result whose config names a rules file outside the repo and never asks GitHub for it', async () => {
  const ctx = await setupTest();

  const config = '{ "rules": ["../shared/taste.md"] }\n';

  await Bun.write(join(ctx.directory, 'shared', 'taste.md'), 'Name each total for what it sums.\n');

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'review.json': config, 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'Change a', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'main',
    sha: repo.commits[0] ?? '',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: repo.commits[0] ?? '',
    path: 'review.json',
    content: config,
  });

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  await Bun.write(join(ctx.directory, 'result.json'), ctx.stdout.splice(0).join(''));

  const requested = mock<(path: string) => void>();

  githubServer.events.on('request:start', (event) => {
    requested(decodeURIComponent(new URL(event.request.url).pathname));
  });

  onTestFinished(() => {
    githubServer.events.removeAllListeners('request:start');
  });

  const code = await runCLI(
    ['verify', join(ctx.directory, 'result.json')],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect({ code, stderr: ctx.stderr.join('') }).toStrictEqual({
    code: 1,
    stderr: 'noslop: the rules file ../shared/taste.md does not exist\n',
  });

  expect(requested).not.toHaveBeenCalledWith(expect.stringContaining('shared/taste.md'));
});

test('it refuses a result that breaks the result contract before it asks GitHub anything', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.directory, 'result.json'), '{ "version": 999 }');

  const requested = mock<(url: string) => void>();

  githubServer.events.on('request:start', (event) => {
    requested(event.request.url);
  });

  onTestFinished(() => {
    githubServer.events.removeAllListeners('request:start');
  });

  const code = await runCLI(
    ['verify', 'result.json'],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  expect(code).toBe(1);
  expect(ctx.stderr.join('')).toStartWith('noslop: ');
  expect(ctx.stderr.join('')).toInclude('"version"');
  expect(requested).not.toHaveBeenCalled();
});

test('it refuses to verify a result that reviews no pull request', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'result.json'),
    JSON.stringify(buildMockReviewResult({ pullRequest: null })),
  );

  const code = await runCLI(
    ['verify', 'result.json'],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  expect({ code, stderr: ctx.stderr.join('') }).toStrictEqual({
    code: 1,
    stderr: 'noslop: the result reviews no pull request, so it cannot verify: review with --pr\n',
  });
});

test('it posts a verified review result to its pull request as the App', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'review.json': '{}\n', 'src/total.ts': 'export const zero = 0;\n' },
    },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = zero - 1;\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
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

  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'main',
    sha: repo.commits[0] ?? '',
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: repo.commits[0] ?? '',
    path: 'review.json',
    content: '{}\n',
  });

  const stub = buildStubAdapter({
    light: [
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

  await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'json', '--json'],
    ctx.buildContext(repo.path, stub.adapter),
  );

  await Bun.write(join(ctx.directory, 'result.json'), ctx.stdout.splice(0).join(''));

  const code = await runCLI(
    ['post', join(ctx.directory, 'result.json')],
    ctx.buildContext(repo.path, stub.adapter),
  );

  expect({ code, stdout: ctx.stdout.join(''), stderr: ctx.stderr.join('') }).toStrictEqual({
    code: 0,
    stdout: `noslop post: posted the review of ${(repo.commits[1] ?? '').slice(0, 12)} to example/app#9\n`,
    stderr: '',
  });

  expect(
    githubCollections.reviewComments
      .all()
      .map((comment) => [comment.authorLogin, comment.path, comment.line]),
  ).toStrictEqual([[STUB_APP_LOGIN, 'src/total.ts', 2]]);

  expect(githubCollections.checkRuns.all()).toMatchObject([
    { name: 'noslop', headSha: repo.commits[1] ?? '', conclusion: 'failure' },
  ]);
});

test('it refuses to post a result that does not verify and posts nothing', async () => {
  const ctx = await setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'main',
    sha: 'a'.repeat(40),
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'a'.repeat(40),
    path: 'review.json',
    content: '{}\n',
  });

  const result = buildMockReviewResult({
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    head: 'b'.repeat(40),
  });

  await Bun.write(join(ctx.directory, 'result.json'), JSON.stringify(result));

  const code = await runCLI(
    ['post', 'result.json'],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  expect(code).toBe(1);

  expect(ctx.stderr.join('')).toStartWith(
    'noslop: noslop posts only a verified result, so it refuses this one: the result does not verify: it reviews bbbbbbbbbbbb, but the head of the pull request is cccccccccccc',
  );

  expect(githubCollections.issueComments.all()).toStrictEqual([]);
  expect(githubCollections.checkRuns.all()).toStrictEqual([]);
});

test('it posts a result that does not verify under --no-verify', async () => {
  const ctx = await setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    headSha: 'c'.repeat(40),
  });

  const result = buildMockReviewResult({
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    head: 'b'.repeat(40),
  });

  await Bun.write(join(ctx.directory, 'result.json'), JSON.stringify(result));

  const code = await runCLI(
    ['post', 'result.json', '--no-verify'],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  expect(code).toBe(0);

  expect(githubCollections.checkRuns.all()).toMatchObject([
    { name: 'noslop', headSha: 'c'.repeat(40), conclusion: 'failure' },
  ]);
});

test('it posts a fixes-only result as no new review and gives the reason a fix is not fixed', async () => {
  const ctx = await setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    headSha: 'c'.repeat(40),
  });

  const thread = await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    path: 'src/scan.ts',
    line: 2,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:finding {"id":"1111111111111111","title":"Reject an empty separator","path":"src/scan.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true,"head":"${'a'.repeat(40)}"} -->`,
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    body: 'fixed ccccccc',
    authorLogin: 'dev',
    inReplyToID: thread.id,
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","base":"${'a'.repeat(40)}","reviews":2,"reported":["1111111111111111"],"failedCalls":0,"reviewIDs":["review-a","review-b"]} -->`,
  });

  const result = buildMockReviewResult({
    reviewID: 'review-c',
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    base: 'b'.repeat(40),
    head: 'c'.repeat(40),
    findings: [],
    fixChecks: [
      {
        findingID: '1111111111111111',
        fixed: false,
        reason: 'The separator can still be empty.',
      },
    ],
  });

  await Bun.write(join(ctx.directory, 'result.json'), JSON.stringify(result));

  await runCLI(
    ['post', 'result.json', '--no-verify'],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  const summary = githubCollections.issueComments
    .all()
    .findLast((comment) => comment.body.includes('<!-- noslop:summary'));

  expect(summary?.body).toInclude('"reviews":2,');
  expect(summary?.body).toInclude('(The separator can still be empty.)');
  expect(summary?.body).toInclude('"reported":["1111111111111111"]');
});

test('it fails the check when no noslop review covers the head of the pull request', async () => {
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
    body: `<!-- noslop:summary {"head":"${'a'.repeat(40)}","reviews":1,"reported":[],"failedCalls":0} -->`,
  });

  const code = await runCLI(
    ['check', '--pr', '9', '--repo', 'example/app'],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  expect({ code, stderr: ctx.stderr.join('') }).toStrictEqual({
    code: 1,
    stderr: 'noslop: no noslop review for this commit\n',
  });

  expect(githubCollections.checkRuns.all()).toMatchObject([
    {
      headSha: 'b'.repeat(40),
      conclusion: 'failure',
      title: 'No noslop review for this commit, bbbbbbbbbbbb.',
    },
  ]);
});

test('it fails the check when the pull request holds no noslop summary at all', async () => {
  const ctx = await setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    headSha: 'b'.repeat(40),
  });

  const code = await runCLI(
    ['check', '--pr', '9', '--repo', 'example/app'],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  expect({ code, stderr: ctx.stderr.join('') }).toStrictEqual({
    code: 1,
    stderr: 'noslop: no noslop review for this commit\n',
  });

  expect(githubCollections.checkRuns.all()).toMatchObject([
    {
      headSha: 'b'.repeat(40),
      conclusion: 'failure',
      title: 'No noslop review for this commit, bbbbbbbbbbbb.',
    },
  ]);
});

test('it exits 0 and sets a failing check when a review covers the head but a call failed', async () => {
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
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","reviews":1,"reported":[],"failedCalls":1} -->`,
  });

  const code = await runCLI(
    ['check', '--pr', '9', '--repo', 'example/app'],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  expect({ code, stderr: ctx.stderr.join('') }).toStrictEqual({ code: 0, stderr: '' });

  expect(githubCollections.checkRuns.all()).toMatchObject([
    { headSha: 'b'.repeat(40), conclusion: 'failure', title: '1 calls of the review failed.' },
  ]);
});

test('it resumes an eval, keeping the cases the out folder holds and replaying the rest', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'head', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  for (const id of ['case-a', 'case-b']) {
    await Bun.write(
      join(ctx.directory, 'corpus', id, 'case.json'),
      JSON.stringify({
        id,
        repo: repo.path,
        base: repo.commits[0],
        head: repo.commits[1],
        title: 'Change a',
        body: '',
        findings: [],
        escapes: [],
      }),
    );
  }

  await Bun.write(
    join(ctx.directory, 'out', 'runs.json'),
    JSON.stringify([
      {
        caseID: 'case-a',
        review: {
          findings: [],
          failed: false,
          tokens: { input: 1, cachedInput: 0, cacheWrite: 0, output: 1 },
          durationMs: 1,
          calls: 1,
          depth: 'light',
        },
      },
    ]),
  );

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  const code = await runCLI(
    [
      'eval',
      '--corpus',
      join(ctx.directory, 'corpus'),
      '--out',
      join(ctx.directory, 'out'),
      '--resume',
    ],
    ctx.buildContext(ctx.directory, stub.adapter),
  );

  const runs: unknown = await Bun.file(join(ctx.directory, 'out', 'runs.json')).json();

  expect(code).toBe(0);
  expect(stub.requests.map((request) => request.callID)).toStrictEqual(['light']);
  expect(runs).toMatchObject([{ caseID: 'case-a' }, { caseID: 'case-b' }]);
});

test("it reads the repo: rules of an eval case from the case's repo and records the rule a finding cites", async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'RULES.md': '## Naming\n\n1. Start a function name with a verb.\n',
        'src/total.ts': 'export const zero = 0;\n',
      },
    },
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

  await Bun.write(join(ctx.directory, 'review.json'), JSON.stringify({ rules: ['repo:RULES.md'] }));

  await Bun.write(
    join(ctx.directory, 'corpus', 'case-a', 'case.json'),
    JSON.stringify({
      id: 'case-a',
      repo: repo.path,
      base: repo.commits[0],
      head: repo.commits[1],
      title: 'Add the total',
      body: '',
      findings: [],
      escapes: [],
    }),
  );

  const stub = buildStubAdapter({
    light: [
      {
        findings: {
          correctness: [],
          'naming-shape-and-comments': [
            {
              title: 'Start "total" with a verb',
              body: 'The rule asks each function name to start with a verb.',
              anchor: { path: 'src/total.ts', startLine: 3, endLine: 3 },
              secondLocation: null,
              severity: 'P2',
              criterion: 'taste-rule',
              rule: 'RULES.md',
              ruleQuote: 'Start a function name with a verb.',
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: 'Rename it to countTotal.',
            },
          ],
          tests: [],
        },
      },
    ],
  });

  await runCLI(
    ['eval', '--corpus', join(ctx.directory, 'corpus'), '--out', join(ctx.directory, 'out')],
    ctx.buildContext(ctx.directory, stub.adapter),
  );

  const runs: unknown = await Bun.file(join(ctx.directory, 'out', 'runs.json')).json();

  expect(stub.requests[0]?.prompt).toInclude('### RULES.md\n\n## Naming');

  expect(runs).toMatchObject([
    {
      caseID: 'case-a',
      review: {
        findings: [{ criterion: 'taste-rule', rule: 'RULES.md: Naming' }],
        dropped: [],
      },
    },
  ]);
});

test('it records in the eval run a taste finding whose quote the rules file does not hold', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: {
        'RULES.md': '## Naming\n\n1. Start a function name with a verb.\n',
        'src/total.ts': 'export const zero = 0;\n',
      },
    },
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

  await Bun.write(join(ctx.directory, 'review.json'), JSON.stringify({ rules: ['repo:RULES.md'] }));

  await Bun.write(
    join(ctx.directory, 'corpus', 'case-a', 'case.json'),
    JSON.stringify({
      id: 'case-a',
      repo: repo.path,
      base: repo.commits[0],
      head: repo.commits[1],
      title: 'Add the total',
      body: '',
      findings: [],
      escapes: [],
    }),
  );

  const stub = buildStubAdapter({
    light: [
      {
        findings: {
          correctness: [],
          'naming-shape-and-comments': [
            {
              title: 'Start "total" with a verb',
              body: 'The rule asks each function name to start with a verb.',
              anchor: { path: 'src/total.ts', startLine: 3, endLine: 3 },
              secondLocation: null,
              severity: 'P2',
              criterion: 'taste-rule',
              rule: 'RULES.md',
              ruleQuote: 'Every function name starts with a verb.',
              verdict: 'CONFIRMED',
              unverifiedFact: null,
              missingChange: false,
              fix: 'Rename it to countTotal.',
            },
          ],
          tests: [],
        },
      },
    ],
  });

  await runCLI(
    ['eval', '--corpus', join(ctx.directory, 'corpus'), '--out', join(ctx.directory, 'out')],
    ctx.buildContext(ctx.directory, stub.adapter),
  );

  const runs: unknown = await Bun.file(join(ctx.directory, 'out', 'runs.json')).json();

  expect(runs).toMatchObject([
    {
      caseID: 'case-a',
      review: {
        findings: [],
        dropped: [
          {
            lens: 'naming-shape-and-comments',
            title: 'Start "total" with a verb',
            reason: 'unknown-rule',
            rule: 'RULES.md',
            ruleQuote: 'Every function name starts with a verb.',
          },
        ],
      },
    },
  ]);
});

test('it replays an eval case with a last reviewed head as a re-review of the push alone', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/parse.ts': 'export const parse = 0;\n' } },
    {
      message: 'Add the printer',
      files: {
        'src/parse.ts': 'export const parse = 0;\n',
        'src/print.ts': 'export const print = 1;\n',
      },
    },
    {
      message: 'Fix the parser',
      files: {
        'src/parse.ts': 'export const parse = 1;\n',
        'src/print.ts': 'export const print = 1;\n',
      },
    },
  ]);

  await Bun.write(
    join(ctx.directory, 'corpus', 'case-a', 'case.json'),
    JSON.stringify({
      id: 'case-a',
      repo: repo.path,
      base: repo.commits[0],
      head: repo.commits[2],
      reviewedHead: repo.commits[1],
      title: 'Add the printer and fix the parser',
      body: 'Changes src/parse.ts and src/print.ts.',
      linkedIssue: 'Add a printer, and make the parser return 1.',
      findings: [],
      escapes: [],
    }),
  );

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [], intent: [] } }] });

  await runCLI(
    ['eval', '--corpus', join(ctx.directory, 'corpus'), '--out', join(ctx.directory, 'out')],
    ctx.buildContext(ctx.directory, stub.adapter),
  );

  const prompt = stub.requests[0]?.prompt;

  if (prompt === undefined) {
    throw new Error('the replay made no call');
  }

  expect(stub.requests.map((request) => request.callID)).toStrictEqual(['light']);
  expect(prompt).toInclude(`from commit ${repo.commits[1] ?? ''} to commit`);
  expect(prompt).toInclude('## Incremental review');
  expect(prompt).toInclude('# Lens: intent');
  expect(prompt).toInclude('## Linked issue\n\nAdd a printer, and make the parser return 1.');
  expect(prompt).toInclude('### src/parse.ts (modified)');
  expect(prompt).not.toInclude('### src/print.ts');
});

test('it replays an eval case with no last reviewed head as a review of the whole change', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/parse.ts': 'export const parse = 0;\n' } },
    { message: 'Fix the parser', files: { 'src/parse.ts': 'export const parse = 1;\n' } },
  ]);

  await Bun.write(
    join(ctx.directory, 'corpus', 'case-a', 'case.json'),
    JSON.stringify({
      id: 'case-a',
      repo: repo.path,
      base: repo.commits[0],
      head: repo.commits[1],
      title: 'Fix the parser',
      body: 'Changes src/parse.ts.',
      findings: [],
      escapes: [],
    }),
  );

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['eval', '--corpus', join(ctx.directory, 'corpus'), '--out', join(ctx.directory, 'out')],
    ctx.buildContext(ctx.directory, stub.adapter),
  );

  const prompt = stub.requests[0]?.prompt;

  if (prompt === undefined) {
    throw new Error('the replay made no call');
  }

  expect(prompt).toInclude(`from commit ${repo.commits[0] ?? ''} to commit`);
  expect(prompt).not.toInclude('## Incremental review');
  expect(prompt).not.toInclude('# Lens: intent');
});

test('it replays the depth of each case with no model call under --static', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'head', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  await Bun.write(
    join(ctx.directory, 'corpus', 'case-a', 'case.json'),
    JSON.stringify({
      id: 'case-a',
      repo: repo.path,
      base: repo.commits[0],
      head: repo.commits[1],
      title: 'Change a',
      body: '',
      findings: [
        {
          anchor: { path: 'unknown', startLine: 1, endLine: 1 },
          title: 'Keep a at 1',
          severity: 'P1',
          lens: 'correctness',
          label: 'true-positive',
        },
      ],
      escapes: [],
    }),
  );

  const stub = buildStubAdapter({});

  const code = await runCLI(
    [
      'eval',
      '--corpus',
      join(ctx.directory, 'corpus'),
      '--out',
      join(ctx.directory, 'out'),
      '--static',
    ],
    ctx.buildContext(ctx.directory, stub.adapter),
  );

  const written: unknown = await Bun.file(join(ctx.directory, 'out', 'static.json')).json();

  expect(code).toBe(0);
  expect(stub.requests).toStrictEqual([]);

  expect(written).toMatchObject({
    runs: [{ caseID: 'case-a', plan: { depth: 'light', calls: ['light'], maxCalls: 2 } }],
    score: { lightMisses: [{ caseID: 'case-a', kind: 'p1', text: 'Keep a at 1' }] },
  });
});

test('it plans a re-review case under --static from its last reviewed head', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/parse.ts': 'export const parse = 0;\n' } },
    {
      message: 'Add the session check',
      files: {
        'src/parse.ts': 'export const parse = 0;\n',
        'src/auth/session.ts':
          'export function isSignedIn(token: string): boolean {\n  return token !== "";\n}\n',
      },
    },
    {
      message: 'Fix the parser',
      files: {
        'src/parse.ts': 'export const parse = 1;\n',
        'src/auth/session.ts':
          'export function isSignedIn(token: string): boolean {\n  return token !== "";\n}\n',
      },
    },
  ]);

  await Bun.write(
    join(ctx.directory, 'corpus', 'case-a', 'case.json'),
    JSON.stringify({
      id: 'case-a',
      repo: repo.path,
      base: repo.commits[0],
      head: repo.commits[2],
      reviewedHead: repo.commits[1],
      title: 'Add the session check and fix the parser',
      body: '',
      findings: [],
      escapes: [],
    }),
  );

  const stub = buildStubAdapter({});

  await runCLI(
    [
      'eval',
      '--corpus',
      join(ctx.directory, 'corpus'),
      '--out',
      join(ctx.directory, 'out'),
      '--static',
    ],
    ctx.buildContext(ctx.directory, stub.adapter),
  );

  const written: unknown = await Bun.file(join(ctx.directory, 'out', 'static.json')).json();

  expect(written).toMatchObject({
    runs: [{ caseID: 'case-a', plan: { depth: 'light', calls: ['light'] } }],
  });
});

test('it plans a re-review case under --static from the files the change makes after a merge from its base', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/parse.ts': 'export const parse = 0;\n' } },
    { message: 'Count the tokens', files: { 'src/parse.ts': 'export const parse = 1;\n' } },
    {
      message: 'Add the session check',
      files: {
        'src/auth/session.ts':
          'export function isSignedIn(token: string): boolean {\n  return token !== "";\n}\n',
      },
      parent: 0,
    },
    {
      message: 'Merge main and fix the parser',
      files: { 'src/parse.ts': 'export const parse = 2;\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  await Bun.write(
    join(ctx.directory, 'corpus', 'case-a', 'case.json'),
    JSON.stringify({
      id: 'case-a',
      repo: repo.path,
      base: repo.commits[2],
      head: repo.commits[3],
      reviewedHead: repo.commits[1],
      title: 'Fix the parser',
      body: '',
      findings: [],
      escapes: [],
    }),
  );

  const stub = buildStubAdapter({});

  await runCLI(
    [
      'eval',
      '--corpus',
      join(ctx.directory, 'corpus'),
      '--out',
      join(ctx.directory, 'out'),
      '--static',
    ],
    ctx.buildContext(ctx.directory, stub.adapter),
  );

  const written: unknown = await Bun.file(join(ctx.directory, 'out', 'static.json')).json();

  expect(written).toMatchObject({
    runs: [{ caseID: 'case-a', plan: { depth: 'light', calls: ['light'] } }],
  });
});

test('it replays a re-review case over the files the change makes after a merge from its base', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/parse.ts': 'export const parse = 0;\n' } },
    { message: 'Count the tokens', files: { 'src/parse.ts': 'export const parse = 1;\n' } },
    {
      message: 'Add the session check',
      files: {
        'src/auth/session.ts':
          'export function isSignedIn(token: string): boolean {\n  return token !== "";\n}\n',
      },
      parent: 0,
    },
    {
      message: 'Merge main and fix the parser',
      files: { 'src/parse.ts': 'export const parse = 2;\n' },
      parent: 1,
      merged: 2,
    },
  ]);

  await Bun.write(
    join(ctx.directory, 'corpus', 'case-a', 'case.json'),
    JSON.stringify({
      id: 'case-a',
      repo: repo.path,
      base: repo.commits[2],
      head: repo.commits[3],
      reviewedHead: repo.commits[1],
      title: 'Fix the parser',
      body: '',
      findings: [],
      escapes: [],
    }),
  );

  const stub = buildStubAdapter({ light: [{ findings: { correctness: [] } }] });

  await runCLI(
    ['eval', '--corpus', join(ctx.directory, 'corpus'), '--out', join(ctx.directory, 'out')],
    ctx.buildContext(ctx.directory, stub.adapter),
  );

  const prompt = stub.requests[0]?.prompt;

  if (prompt === undefined) {
    throw new Error('the replay made no call');
  }

  expect(stub.requests.map((request) => request.callID)).toStrictEqual(['light']);
  expect(prompt).toInclude('### src/parse.ts (modified)');
  expect(prompt).not.toInclude('src/auth/session.ts');
});

test('it plans the intent call under --static for a case with a linked issue', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'head', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  await Bun.write(
    join(ctx.directory, 'corpus', 'case-a', 'case.json'),
    JSON.stringify({
      id: 'case-a',
      repo: repo.path,
      base: repo.commits[0],
      head: repo.commits[1],
      title: 'Change a',
      body: '',
      linkedIssue: 'Set a to 2.',
      findings: [],
      escapes: [],
    }),
  );

  await runCLI(
    [
      'eval',
      '--corpus',
      join(ctx.directory, 'corpus'),
      '--out',
      join(ctx.directory, 'out'),
      '--static',
      '--depth',
      'standard',
    ],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  const written: unknown = await Bun.file(join(ctx.directory, 'out', 'static.json')).json();

  expect(written).toMatchObject({
    runs: [{ caseID: 'case-a', plan: { depth: 'standard', calls: ['correctness', 'intent'] } }],
  });
});

test('it plans every case at the depth that --depth names', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/a.ts': 'export const a = 1;\n' } },
    { message: 'head', files: { 'src/a.ts': 'export const a = 2;\n' } },
  ]);

  await Bun.write(
    join(ctx.directory, 'corpus', 'case-a', 'case.json'),
    JSON.stringify({
      id: 'case-a',
      repo: repo.path,
      base: repo.commits[0],
      head: repo.commits[1],
      title: 'Change a',
      body: '',
      findings: [],
      escapes: [],
    }),
  );

  const code = await runCLI(
    [
      'eval',
      '--corpus',
      join(ctx.directory, 'corpus'),
      '--out',
      join(ctx.directory, 'out'),
      '--static',
      '--depth',
      'standard',
    ],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  const written: unknown = await Bun.file(join(ctx.directory, 'out', 'static.json')).json();

  expect(code).toBe(0);
  expect(written).toMatchObject({ runs: [{ caseID: 'case-a', plan: { depth: 'standard' } }] });
});

test('it refuses a --depth that names no depth', async () => {
  const ctx = await setupTest();

  await Bun.write(
    join(ctx.directory, 'corpus', 'case-a', 'case.json'),
    JSON.stringify({
      id: 'case-a',
      repo: join(ctx.directory, 'repo'),
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      title: 'Change a',
      body: '',
      findings: [],
      escapes: [],
    }),
  );

  const code = await runCLI(
    ['eval', '--corpus', join(ctx.directory, 'corpus'), '--static', '--depth', 'deepest'],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  expect(code).toBe(1);
  expect(ctx.stderr.join('')).toInclude('--depth takes light, standard or deep, not deepest');
});

test('it puts an unknown option on stderr and keeps stdout empty', async () => {
  const ctx = await setupTest();

  const code = await runCLI(
    ['review', '--no-such-flag', '--json'],
    ctx.buildContext(ctx.directory, buildStubAdapter({}).adapter),
  );

  expect(code).toBe(1);
  expect(ctx.stdout).toStrictEqual([]);
  expect(ctx.stderr.join('')).toInclude('no-such-flag');
});

test('it reads the repo config when it runs from a subfolder', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
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
