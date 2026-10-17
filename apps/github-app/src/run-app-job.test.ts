import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubRunner } from '@noslop/testing';
import { runAppJob } from './run-app-job';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'noslop-app-job-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it clones the repo, fetches the pull request and reviews it through the App', async () => {
  const ctx = await setupTest();

  const stub = buildStubRunner([
    { argv: ['git', 'clone'], result: {} },
    { argv: ['git', 'fetch'], result: {} },
    { argv: ['git', 'checkout'], result: {} },
    { argv: ['bun', '--config=/app/bunfig.toml', 'cli.ts', 'review'], result: {} },
  ]);

  await runAppJob(
    { kind: 'review', owner: 'example', repo: 'app', number: 5, installationID: 7 },
    {
      runner: stub.runner,
      cliPath: 'cli.ts',
      bunConfigPath: '/app/bunfig.toml',
      reposDir: ctx.dir,
      appID: 1,
      privateKey: 'app-key',
      mintToken: () => Promise.resolve('ghs_token'),
    },
  );

  expect(stub.runs.map((run) => run.argv)).toStrictEqual([
    [
      'git',
      'clone',
      '--quiet',
      'https://github.com/example/app.git',
      join(ctx.dir, 'example', 'app'),
    ],
    ['git', 'fetch', '--quiet', 'origin', 'pull/5/head'],
    ['git', 'checkout', '--quiet', '--force', '--detach', 'origin/HEAD'],
    [
      'bun',
      '--config=/app/bunfig.toml',
      'cli.ts',
      'review',
      '--pr',
      '5',
      '--repo',
      'example/app',
      '--report',
      'sqlite,github',
    ],
  ]);

  expect(stub.runs.map((run) => run.argv.join(' '))).toSatisfyAll(
    (line: string) => !line.includes('ghs_token') && !line.includes('app-key'),
  );

  expect(stub.runs[3]?.options.env).toMatchObject({
    NOSLOP_GITHUB_APP_ID: '1',
    NOSLOP_GITHUB_APP_PRIVATE_KEY: 'app-key',
    NOSLOP_GITHUB_APP_INSTALLATION_ID: '7',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from('x-access-token:ghs_token').toString('base64')}`,
  });
});

test('it fetches into the clone it made before and checks out the default branch', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'example', 'app', '.git'), { recursive: true });

  const stub = buildStubRunner([
    { argv: ['git', 'fetch'], result: {} },
    { argv: ['git', 'fetch'], result: {} },
    { argv: ['git', 'checkout'], result: {} },
    { argv: ['bun'], result: {} },
  ]);

  await runAppJob(
    { kind: 'review', owner: 'example', repo: 'app', number: 5, installationID: 7 },
    {
      runner: stub.runner,
      cliPath: 'cli.ts',
      bunConfigPath: '/app/bunfig.toml',
      reposDir: ctx.dir,
      appID: 1,
      privateKey: 'app-key',
      mintToken: () => Promise.resolve('ghs_token'),
    },
  );

  expect(stub.runs.map((run) => run.argv.slice(0, 2))).toStrictEqual([
    ['git', 'fetch'],
    ['git', 'fetch'],
    ['git', 'checkout'],
    ['bun', '--config=/app/bunfig.toml'],
  ]);
});

test('it sets the check again with no clone after a reply', async () => {
  const ctx = await setupTest();

  const stub = buildStubRunner([{ argv: ['bun'], result: {} }]);

  await runAppJob(
    { kind: 'check', owner: 'example', repo: 'app', number: 5, installationID: 7 },
    {
      runner: stub.runner,
      cliPath: 'cli.ts',
      bunConfigPath: '/app/bunfig.toml',
      reposDir: ctx.dir,
      appID: 1,
      privateKey: 'app-key',
      mintToken: () => Promise.reject(new Error('a check mints no token')),
    },
  );

  expect(stub.runs.map((run) => run.argv)).toStrictEqual([
    ['bun', '--config=/app/bunfig.toml', 'cli.ts', 'check', '--pr', '5', '--repo', 'example/app'],
  ]);
});

test('it fails the job when the review exits non-zero', async () => {
  const ctx = await setupTest();

  const stub = buildStubRunner([
    { argv: ['git', 'clone'], result: {} },
    { argv: ['git', 'fetch'], result: {} },
    { argv: ['git', 'checkout'], result: {} },
    { argv: ['bun'], result: { exitCode: 1, stderr: 'noslop: the call failed\n' } },
  ]);

  expect(
    runAppJob(
      { kind: 'review', owner: 'example', repo: 'app', number: 5, installationID: 7 },
      {
        runner: stub.runner,
        cliPath: 'cli.ts',
        bunConfigPath: '/app/bunfig.toml',
        reposDir: ctx.dir,
        appID: 1,
        privateKey: 'app-key',
        mintToken: () => Promise.resolve('ghs_token'),
      },
    ),
  ).rejects.toThrowWithMessage(Error, 'bun cli.ts review exited 1: noslop: the call failed');
});
