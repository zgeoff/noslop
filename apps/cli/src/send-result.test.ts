import { expect, test } from 'bun:test';
import {
  STUB_APP_LOGIN,
  buildMockReviewResult,
  buildStubAppKey,
  githubCollections,
} from '@noslop/testing';
import { sendResult } from './send-result';

test('it posts a review result as the App whose keys the environment holds', async () => {
  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    headSha: 'b'.repeat(40),
  });

  const result = buildMockReviewResult({
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    head: 'b'.repeat(40),
  });

  await sendResult(result, {
    env: {
      NOSLOP_GITHUB_APP_ID: '1',
      NOSLOP_GITHUB_APP_PRIVATE_KEY: buildStubAppKey(),
      NOSLOP_GITHUB_APP_INSTALLATION_ID: '7',
    },
    verify: false,
  });

  expect(githubCollections.issueComments.all()).toMatchObject([{ authorLogin: STUB_APP_LOGIN }]);
});

test('it refuses to post when the environment holds no App keys', () => {
  const result = buildMockReviewResult({
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
  });

  expect(sendResult(result, { env: {}, verify: false })).rejects.toThrowWithMessage(
    Error,
    'posting needs the App: set NOSLOP_GITHUB_APP_ID, NOSLOP_GITHUB_APP_PRIVATE_KEY and NOSLOP_GITHUB_APP_INSTALLATION_ID',
  );
});

test('it refuses to post a result that reviews no pull request', () => {
  expect(
    sendResult(buildMockReviewResult({ pullRequest: null }), { env: {}, verify: false }),
  ).rejects.toThrowWithMessage(
    Error,
    'the result reviews no pull request, so it has nowhere to post: review with --pr',
  );
});
