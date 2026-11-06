import { expect, test } from 'bun:test';
import { createStubRetargetDuringRead } from './create-stub-retarget-during-read';
import { githubCollections } from './github-collections';
import { GITHUB_API_URL } from './github-handlers';
import { githubServer } from './github-server';

test('it moves the pull request to the other base branch on the first file read and still serves the file', async () => {
  await githubCollections.pullRequests.create({ number: 5, baseRef: 'main' });

  await githubCollections.files.create({
    owner: 'example',
    repo: 'app',
    ref: 'main',
    path: 'review.json',
    content: '{}',
  });

  githubServer.use(createStubRetargetDuringRead({ number: 5, baseRef: 'release' }));

  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/contents/review.json?ref=main`);

  expect([
    response.status,
    githubCollections.pullRequests.all().map((pullRequest) => pullRequest.baseRef),
  ]).toStrictEqual([200, ['release']]);
});

test('it moves the base branch once however many reads follow', async () => {
  await githubCollections.pullRequests.create({ number: 5, baseRef: 'main' });

  githubServer.use(createStubRetargetDuringRead({ number: 5, baseRef: 'release' }));

  await fetch(`${GITHUB_API_URL}/repos/example/app/contents/review.json?ref=main`);

  await githubCollections.pullRequests.update((query) => query.where({ number: 5 }), {
    data(pullRequest) {
      pullRequest.baseRef = 'main';
    },
  });

  await fetch(`${GITHUB_API_URL}/repos/example/app/contents/review.json?ref=main`);

  expect(
    githubCollections.pullRequests.all().map((pullRequest) => pullRequest.baseRef),
  ).toStrictEqual(['main']);
});
