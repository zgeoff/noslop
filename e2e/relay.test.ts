import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  STUB_APP_LOGIN,
  buildStubAdapter,
  buildStubAppKey,
  createTestRepo,
  githubCollections,
  githubServer,
} from '@noslop/testing';
import { http, passthrough } from 'msw';
import { createCLIContext } from '../apps/cli/src/create-cli-context';
import { runCLI } from '../apps/cli/src/run-cli';
import { sendResult } from '../apps/cli/src/send-result';
import { verify } from '../apps/cli/src/verify';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-relay-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const appEnv = {
    NOSLOP_GITHUB_APP_ID: '1',
    NOSLOP_GITHUB_APP_PRIVATE_KEY: buildStubAppKey(),
    NOSLOP_GITHUB_APP_INSTALLATION_ID: '7',
  };

  const relay = Bun.serve({
    port: 0,
    routes: {
      '/noslop': {
        POST: async (request) => {
          const body: unknown = await request.json();
          const result = await verify(body, { env: appEnv });

          await sendResult(result, { env: appEnv, verify: false });

          return new Response('posted');
        },
      },
    },
  });

  onTestFinished(() => relay.stop(true));

  const relayURL = new URL('/noslop', relay.url).href;

  githubServer.use(http.post(relayURL, () => passthrough()));

  const stdout: string[] = [];
  const stderr: string[] = [];

  const folders = {
    XDG_CACHE_HOME: join(directory, 'cache'),
    XDG_DATA_HOME: join(directory, 'data'),
  };

  const developerEnv = { ...folders, RELAY_SECRET: 'relay-secret' };
  const ciEnv = { ...folders, ...appEnv };

  const createContext = (
    env: Record<string, string>,
    cwd: string,
    stub: ReturnType<typeof buildStubAdapter>,
  ) => ({
    ...createCLIContext(env),
    cwd,
    writeStdout: (text: string) => {
      stdout.push(text);
    },
    writeStderr: (text: string) => {
      stderr.push(text);
    },
    createAdapter: () => stub.adapter,
  });

  return { directory, relayURL, stdout, stderr, developerEnv, ciEnv, createContext };
}

test('it carries a review from a developer machine through the relay and passes the check once each finding has an answer', async () => {
  const ctx = await setupTest();

  const config = `${JSON.stringify({
    reporters: {
      webhook: { url: ctx.relayURL, secretHeader: 'x-relay-secret', secretEnv: 'RELAY_SECRET' },
    },
  })}\n`;

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    {
      message: 'base',
      files: { 'review.json': config, 'src/total.ts': 'export const zero = 0;\n' },
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
    title: 'Add one',
    baseRef: 'main',
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
    content: config,
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
    design: [{ findings: { design: [] } }],
  });

  const unreviewed = await runCLI(
    ['check', '--pr', '9', '--repo', 'example/app'],
    ctx.createContext(ctx.ciEnv, repo.path, stub),
  );

  expect({ code: unreviewed, stderr: ctx.stderr.splice(0).join('') }).toStrictEqual({
    code: 1,
    stderr: 'noslop: no noslop review for this commit\n',
  });

  const reviewed = await runCLI(
    ['review', '--pr', '9', '--repo', 'example/app', '--report', 'webhook'],
    ctx.createContext(ctx.developerEnv, repo.path, stub),
  );

  const finding = githubCollections.reviewComments.findFirst((query) =>
    query.where({ authorLogin: STUB_APP_LOGIN, inReplyToID: null }),
  );

  expect({ code: reviewed, stderr: ctx.stderr.splice(0).join('') }).toStrictEqual({
    code: 0,
    stderr: '',
  });

  expect(finding).toMatchObject({ path: 'src/total.ts', line: 2 });

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    headSha: repo.commits[1] ?? '',
    conclusion: 'failure',
    title: '1 findings hold no valid disposition.',
  });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: 'dev',
    inReplyToID: finding?.id ?? null,
    body: 'not-a-defect the constant counts down from zero on purpose',
  });

  const answered = await runCLI(
    ['check', '--pr', '9', '--repo', 'example/app'],
    ctx.createContext(ctx.ciEnv, repo.path, stub),
  );

  expect({ code: answered, stderr: ctx.stderr.join('') }).toStrictEqual({ code: 0, stderr: '' });

  expect(githubCollections.checkRuns.all().at(-1)).toMatchObject({
    headSha: repo.commits[1] ?? '',
    conclusion: 'success',
  });
});
