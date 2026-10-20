import { expect, test } from 'bun:test';
import { STUB_APP_LOGIN, buildStubAppKey, githubCollections } from '@noslop/testing';
import { check } from './check';

test('it sets the check as the App whose keys the environment holds and returns its outcome', async () => {
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

  const outcome = await check(
    { owner: 'example', repo: 'app', number: 9 },
    {
      env: {
        NOSLOP_GITHUB_APP_ID: '1',
        NOSLOP_GITHUB_APP_PRIVATE_KEY: buildStubAppKey(),
        NOSLOP_GITHUB_APP_INSTALLATION_ID: '7',
      },
    },
  );

  expect(outcome).toStrictEqual({
    conclusion: 'success',
    title: 'Every finding holds a valid disposition (0)',
    summary: '',
    open: [],
    reviewed: true,
  });
});

test('it returns the outcome under a token with readOnly and sets no check run', async () => {
  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    baseRef: 'main',
    headSha: 'b'.repeat(40),
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
    content: '{ "github": { "app": "noslop-review" } }\n',
  });

  await githubCollections.issueComments.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: `<!-- noslop:summary {"head":"${'b'.repeat(40)}","reviews":1,"reported":[],"failedCalls":1} -->`,
  });

  const outcome = await check(
    { owner: 'example', repo: 'app', number: 9 },
    { env: { GITHUB_TOKEN: 'ghp_ci_job' }, readOnly: true },
  );

  expect(outcome).toStrictEqual({
    conclusion: 'failure',
    title: '1 calls of the review failed.',
    summary: '1 calls of the review failed.',
    open: [],
    reviewed: true,
  });

  expect(githubCollections.checkRuns.all()).toStrictEqual([]);
});

test('it refuses to check under a token without readOnly', () => {
  expect(
    check({ owner: 'example', repo: 'app', number: 9 }, { env: { GITHUB_TOKEN: 'ghp_ci_job' } }),
  ).rejects.toThrowWithMessage(Error, /^checking sets the check run as the App: /u);
});
