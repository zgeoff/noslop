import { afterAll, afterEach } from 'bun:test';
import { githubServer } from './github-server';
import { resetGitHubCollections } from './reset-github-collections';

githubServer.listen({ onUnhandledRequest: 'error' });

afterEach(() => {
  githubServer.resetHandlers();

  resetGitHubCollections();
});

afterAll(() => {
  githubServer.close();
});
