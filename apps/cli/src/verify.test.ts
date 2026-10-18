import { expect, test } from 'bun:test';
import { buildMockReviewResult, buildStubAppKey, githubCollections } from '@noslop/testing';
import { verify } from './verify';

test('it reads the pull request as the App whose keys the environment holds', async () => {
  await githubCollections.pullRequests.create({
    owner: 'example',
    repo: 'app',
    number: 9,
    headSha: 'c'.repeat(40),
  });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: 'review.json',
    content: '{}\n',
  });

  const result = buildMockReviewResult({
    pullRequest: { owner: 'example', repo: 'app', number: 9 },
    head: 'b'.repeat(40),
  });

  const env = {
    NOSLOP_GITHUB_APP_ID: '1',
    NOSLOP_GITHUB_APP_PRIVATE_KEY: buildStubAppKey(),
    NOSLOP_GITHUB_APP_INSTALLATION_ID: '7',
  };

  expect(verify(result, { env })).rejects.toThrowWithMessage(
    Error,
    /^the result does not verify: it reviews bbbbbbbbbbbb, but the head of the pull request is cccccccccccc; /u,
  );
});
