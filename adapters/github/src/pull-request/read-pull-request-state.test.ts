import { expect, test } from 'bun:test';
import { createGitHubConnection } from '../connection/create-github-connection';
import { buildStubAppKey } from '../test-utils/build-stub-app-key';
import { githubCollections } from '../test-utils/github-collections';
import { STUB_APP_LOGIN } from '../test-utils/github-handlers';
import { readPullRequestState } from './read-pull-request-state';

function setupTest() {
  const privateKey = buildStubAppKey();
  const loadConnection = () => createGitHubConnection({ appID: 1, privateKey, installationID: 7 });

  return { loadConnection };
}

test('it keeps the lines a finding comment was posted on after a push moves the comment', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({ owner: 'example', repo: 'app', number: 5 });

  await githubCollections.reviewComments.create({
    owner: 'example',
    repo: 'app',
    number: 5,
    path: 'src/a.ts',
    startLine: 40,
    line: 42,
    originalStartLine: 10,
    originalLine: 12,
    authorLogin: STUB_APP_LOGIN,
    authorType: 'Bot',
    body: '<!-- noslop:finding {"id":"1111111111111111","title":"Await the write","path":"src/a.ts","lens":"correctness","severity":"P2","riskClass":null,"writtenByChange":true} -->',
  });

  const connection = await ctx.loadConnection();

  const state = await readPullRequestState(connection, {
    owner: 'example',
    repo: 'app',
    number: 5,
  });

  expect(state.threads).toMatchObject([{ startLine: 10, line: 12 }]);
});

test('it reads the login of the account that opened the pull request', async () => {
  const ctx = setupTest();

  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 6,
    authorLogin: 'mirror-bot[bot]',
  });

  const connection = await ctx.loadConnection();

  const state = await readPullRequestState(connection, {
    owner: 'example',
    repo: 'app',
    number: 6,
  });

  expect(state.author).toBe('mirror-bot[bot]');
});
