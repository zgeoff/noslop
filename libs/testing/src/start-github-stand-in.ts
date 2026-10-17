import { afterAll, afterEach } from 'bun:test';
import { githubServer } from './github-server';
import { resetGitHubCollections } from './reset-github-collections';

// the test preload: the stand-in GitHub API answers every request to GitHub in the test process, and
// a request that no handler matches fails its test; the suites reach no other HTTP service
githubServer.listen({ onUnhandledRequest: 'error' });

afterEach(() => {
  githubServer.resetHandlers();

  resetGitHubCollections();
});

afterAll(() => {
  githubServer.close();
});
