import { afterEach } from 'bun:test';
import { createTestNetwork } from '@zgeoff/testing/fetch';
import { githubContentHandlers } from './github-content-handlers';
import { githubHandlers } from './github-handlers';
import { githubPullFileHandlers } from './github-pull-file-handlers';
import { resetGitHubCollections } from './reset-github-collections';

// The one test network of the process, which the root bunfig lists as a preload. The webhook tests
// and the CLI relay test call test servers on ephemeral loopback ports, which the network lets
// through.
export const githubNetwork = createTestNetwork({
  handlers: [...githubHandlers, ...githubPullFileHandlers, ...githubContentHandlers],
});

afterEach(() => {
  resetGitHubCollections();
});
