import { afterAll, afterEach, beforeAll } from 'bun:test';
import { githubServer } from './github-server';
import { resetGitHubCollections } from './reset-github-collections';

beforeAll(() => {
  githubServer.enable();
});

afterEach(() => {
  githubServer.resetHandlers();

  resetGitHubCollections();
});

afterAll(async () => {
  await githubServer.disable();
});
