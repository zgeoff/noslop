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
