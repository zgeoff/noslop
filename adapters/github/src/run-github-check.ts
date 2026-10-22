import type { PullRequestRef } from '@noslop/contract';
import type { CheckOutcome } from './build-check-outcome';
import { createFormsReplies } from './create-forms-replies';
import type { GitHubConnection } from './create-github-connection';
import { readGitHubCheck } from './read-github-check';
import type { PullRequestState } from './read-pull-request-state';
import { readPullRequestState } from './read-pull-request-state';
import { withServerErrorRetry } from './with-server-error-retry';

export const CHECK_NAME = 'noslop';

export interface GitHubCheckOptions {
  failedReporters: readonly string[];

  // the state a caller already read; read again from GitHub when absent
  state?: PullRequestState;
}

// sets the noslop check run on the pull request's head from what GitHub holds: it answers free-text
// replies, then posts the outcome of the check
export async function runGitHubCheck(
  connection: GitHubConnection,
  pr: PullRequestRef,
  options: GitHubCheckOptions,
): Promise<CheckOutcome> {
  const state = await (options.state === undefined
    ? readPullRequestState(connection, pr)
    : Promise.resolve(options.state));

  await createFormsReplies(connection.client, pr, state.threads);

  const outcome = await readGitHubCheck(connection, pr, {
    failedReporters: options.failedReporters,
    state,
  });

  // a second check run on one head is harmless, because GitHub shows the latest run of a name
  await withServerErrorRetry('noslop check run', connection.retryDelaysMs, () =>
    connection.client.request('POST /repos/{owner}/{repo}/check-runs', {
      owner: pr.owner,
      repo: pr.repo,
      name: CHECK_NAME,
      head_sha: state.headSha,
      status: 'completed',
      conclusion: outcome.conclusion,
      output: { title: outcome.title, summary: outcome.summary || outcome.title },
    }),
  );

  return outcome;
}
