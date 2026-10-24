import { setupServer } from 'msw/node';
import { githubHandlers } from './github-handlers';
import { githubPullFileHandlers } from './github-pull-file-handlers';

export const githubServer = setupServer(...githubHandlers, ...githubPullFileHandlers);
