import { setupServer } from 'msw/node';
import { githubHandlers } from './github-handlers';

// the MSW server of the stand-in GitHub API; the test preload starts it, and a test adds a handler
// through it only for a deviation the collections cannot express
export const githubServer = setupServer(...githubHandlers);
