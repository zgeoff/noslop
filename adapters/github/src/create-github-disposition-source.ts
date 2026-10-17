import type { DispositionSource } from '@noslop/contract';
import type { GitHubClient } from './create-github-client';
import { readPullRequestState } from './read-pull-request-state';
import { readThreadDispositions } from './read-thread-dispositions';

export interface GitHubDispositionSourceOptions {
  loadClient: () => Promise<GitHubClient>;
}

// the typed replies in the finding threads of a pull request, as dispositions for the findings store
export function createGitHubDispositionSource(
  options: GitHubDispositionSourceOptions,
): DispositionSource {
  return {
    id: 'github',
    readDispositions: async (review) => {
      const client = await options.loadClient();
      const state = await readPullRequestState(client, review.pullRequest);

      return readThreadDispositions(client, review.pullRequest, state.threads);
    },
  };
}
