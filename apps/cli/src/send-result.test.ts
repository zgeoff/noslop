import { expect, test } from 'bun:test';
import {
  STUB_APP_LOGIN,
  buildMockFinding,
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

test('it verifies a result by default and posts nothing when it does not verify', async () => {
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
    findings: [buildMockFinding()],
  });

  const env = {
    NOSLOP_GITHUB_APP_ID: '1',
    NOSLOP_GITHUB_APP_PRIVATE_KEY: buildStubAppKey(),
    NOSLOP_GITHUB_APP_INSTALLATION_ID: '7',
  };

  expect(sendResult(result, { env })).rejects.toThrowWithMessage(
    Error,
    /^noslop posts only a verified result, so it refuses this one: the result does not verify: /u,
  );

  expect(githubCollections.reviewComments.all()).toStrictEqual([]);
  expect(githubCollections.issueComments.all()).toStrictEqual([]);
  expect(githubCollections.checkRuns.all()).toStrictEqual([]);
});
