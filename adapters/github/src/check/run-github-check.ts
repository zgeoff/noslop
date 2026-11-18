import type { Disposition, PullRequestRef } from '@noslop/contract';
import type { GitHubConnection } from '../connection/create-github-connection';
import { withWriteRetry } from '../connection/with-write-retry';
import type { DeferralPolicy } from '../dispositions/deferral-policy';
import type { PullRequestState } from '../pull-request/read-pull-request-state';
import { readPullRequestState } from '../pull-request/read-pull-request-state';
import type { CheckOutcome } from './build-check-outcome';
import { createFormsReplies } from './create-forms-replies';
import { readGitHubCheck } from './read-github-check';

export const CHECK_NAME = 'noslop';

export interface GitHubCheckOptions {
  policy: DeferralPolicy;

  state?: PullRequestState;

  dispositions?: readonly Disposition[];
}

export async function runGitHubCheck(
  connection: GitHubConnection,
  pr: PullRequestRef,
  options: GitHubCheckOptions,
): Promise<CheckOutcome> {
  const state = await (options.state === undefined
    ? readPullRequestState(connection, pr)
    : Promise.resolve(options.state));

  await createFormsReplies(connection, pr, state.threads);

  const outcome = await readGitHubCheck(connection, pr, {
    state,
    policy: options.policy,
    ...(options.dispositions === undefined ? {} : { dispositions: options.dispositions }),
  });

  // a second check run on one head is harmless, because GitHub shows the latest run of a name
  await withWriteRetry('noslop check run', 'repeatable', connection.sleep, () =>
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
