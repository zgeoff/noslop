import { expect, test } from 'bun:test';
import { buildStubPrivateRepo } from './build-stub-private-repo';
import { githubCollections } from './github-collections';
import { GITHUB_API_URL } from './github-handlers';
import { githubServer } from './github-server';

test('it answers a request without a token as a repo that does not exist', async () => {
  githubServer.use(buildStubPrivateRepo({ owner: 'example', repo: 'secret', token: 'ghp_reader' }));

  await githubCollections.pullRequests.create({ owner: 'example', repo: 'secret', number: 3 });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/secret/pulls/3`);

  expect(response.status).toBe(404);
});

test('it answers a request with another token as a repo that does not exist', async () => {
  githubServer.use(buildStubPrivateRepo({ owner: 'example', repo: 'secret', token: 'ghp_reader' }));

  await githubCollections.pullRequests.create({ owner: 'example', repo: 'secret', number: 3 });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/secret/pulls/3`, {
    headers: { authorization: 'token ghp_stranger' },
  });

  expect(response.status).toBe(404);
});

test('it serves the repo to a request with its token', async () => {
  githubServer.use(buildStubPrivateRepo({ owner: 'example', repo: 'secret', token: 'ghp_reader' }));

  await githubCollections.pullRequests.create({ owner: 'example', repo: 'secret', number: 3 });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/secret/pulls/3`, {
    headers: { authorization: 'token ghp_reader' },
  });

  expect(response.status).toBe(200);
});

test('it leaves every other repo public', async () => {
  githubServer.use(buildStubPrivateRepo({ owner: 'example', repo: 'secret', token: 'ghp_reader' }));

  await githubCollections.pullRequests.create({ owner: 'example', repo: 'app', number: 3 });

  const response = await fetch(`${GITHUB_API_URL}/repos/example/app/pulls/3`);

  expect(response.status).toBe(200);
});
