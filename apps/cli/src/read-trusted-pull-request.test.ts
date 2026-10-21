import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GITHUB_API_URL, createTestRepo, githubCollections, githubServer } from '@noslop/testing';
import { HttpResponse, http } from 'msw';
import { createCLIContext } from './create-cli-context';
import { readTrustedPullRequest } from './read-trusted-pull-request';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'noslop-trusted-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, cli: createCLIContext({ GH_TOKEN: 'ghp_reader' }) };
}

test('it loads the config from the tip of the base branch when the base commit of the pull request lags it', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Add one',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const one = 1;\n' },
    },
    {
      message: 'Name the App',
      parent: 0,
      files: { 'review.json': JSON.stringify({ github: { app: 'example-reviewer' } }) },
    },
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
    sha: repo.commits[2] ?? '',
  });

  const trusted = await readTrustedPullRequest(ctx.cli, repo.path, {
    owner: 'example',
    repo: 'app',
    number: 9,
  });

  expect(trusted.config.config.github).toStrictEqual({ app: 'example-reviewer' });
});

test('it reads the config again from the new base branch when the pull request is retargeted between the reads', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Name the App',
      files: { 'review.json': JSON.stringify({ github: { app: 'example-reviewer' } }) },
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
    baseRef: 'main',
    baseSha: repo.commits[1] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'release',
    sha: repo.commits[0] ?? '',
  });

  githubServer.use(
    http.get(
      `${GITHUB_API_URL}/repos/example/app/pulls/9`,
      () =>
        HttpResponse.json({
          number: 9,
          title: 'Add one',
          body: '',
          user: { login: 'feature-author' },
          base: { ref: 'release', sha: repo.commits[0] ?? '' },
          head: { sha: repo.commits[2] ?? '' },
        }),
      { once: true },
    ),
  );

  const trusted = await readTrustedPullRequest(ctx.cli, repo.path, {
    owner: 'example',
    repo: 'app',
    number: 9,
  });

  expect(trusted.state.baseRef).toBe('main');
  expect(trusted.config.config.github).toStrictEqual({ app: 'example-reviewer' });
});

test('it gives up when the pull request is retargeted between the reads each time', async () => {
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
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  await githubCollections.branches.create({
    owner: 'example',
    repo: 'app',
    name: 'release',
    sha: repo.commits[0] ?? '',
  });

  // each attempt reads the base branch, then the state, and the base branch differs between the two
  // every time
  const refs = ['main', 'release', 'main', 'release', 'main', 'release'];

  githubServer.use(
    ...refs.map((ref) =>
      http.get(
        `${GITHUB_API_URL}/repos/example/app/pulls/9`,
        () =>
          HttpResponse.json({
            number: 9,
            title: 'Add one',
            body: '',
            user: { login: 'feature-author' },
            base: { ref, sha: repo.commits[0] ?? '' },
            head: { sha: repo.commits[1] ?? '' },
          }),
        { once: true },
      ),
    ),
  );

  expect(
    readTrustedPullRequest(ctx.cli, repo.path, {
      owner: 'example',
      repo: 'app',
      number: 9,
    }),
  ).rejects.toThrowWithMessage(
    Error,
    'the base branch of the pull request changed during each of 3 reads; review it again once its base branch holds still',
  );
});
