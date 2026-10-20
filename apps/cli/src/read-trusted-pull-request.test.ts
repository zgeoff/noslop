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

test('it reads the config again from the new base when the base branch moves between the reads', async () => {
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
    baseSha: repo.commits[1] ?? '',
    headSha: repo.commits[2] ?? '',
  });

  githubServer.use(
    http.get(
      `${GITHUB_API_URL}/repos/example/app/pulls/9`,
      () =>
        HttpResponse.json({
          number: 9,
          title: 'Add one',
          body: '',
          base: { ref: 'main', sha: repo.commits[0] ?? '' },
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

  expect(trusted.state.baseSha).toBe(repo.commits[1] ?? '');
  expect(trusted.config.config.github).toStrictEqual({ app: 'example-reviewer' });
});

test('it gives up when the base branch moves between the reads each time', async () => {
  const ctx = await setupTest();

  const repo = await createTestRepo(join(ctx.directory, 'repo'), [
    { message: 'base', files: { 'src/total.ts': 'export const zero = 0;\n' } },
    {
      message: 'Move the base',
      files: { 'src/total.ts': 'export const zero = 0;\nexport const nil = 0;\n' },
    },
  ]);

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    baseSha: repo.commits[0] ?? '',
    headSha: repo.commits[1] ?? '',
  });

  // each attempt reads the base, then the state, and the base differs between the two every time
  const bases = [0, 1, 0, 1, 0, 1].map((index) => repo.commits[index] ?? '');

  githubServer.use(
    ...bases.map((sha) =>
      http.get(
        `${GITHUB_API_URL}/repos/example/app/pulls/9`,
        () =>
          HttpResponse.json({
            number: 9,
            title: 'Move the base',
            body: '',
            base: { ref: 'main', sha },
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
    'the base branch of the pull request moved during each of 3 reads; review it again once the base branch holds still',
  );
});
