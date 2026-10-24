import type { DispositionSource } from '@noslop/contract';
import type { GitHubConnection } from './create-github-connection';
import { readPullRequestState } from './read-pull-request-state';
import { readThreadDispositions } from './read-thread-dispositions';

export interface GitHubDispositionSourceOptions {
  loadConnection: () => Promise<GitHubConnection>;
}

export function createGitHubDispositionSource(
  options: GitHubDispositionSourceOptions,
): DispositionSource {
  return {
    id: 'github',
    readDispositions: async (review) => {
      const connection = await options.loadConnection();
      const state = await readPullRequestState(connection, review.pullRequest);

      return readThreadDispositions(connection.client, review.pullRequest, state.threads);
    },
  };
}
