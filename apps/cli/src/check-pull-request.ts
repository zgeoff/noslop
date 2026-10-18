import type { PullRequestRef } from '@noslop/contract';
import type { CheckOutcome, GitHubConnection } from '@noslop/github';
import { readPullRequestState, runGitHubCheck } from '@noslop/github';

export interface PullRequestCheck extends CheckOutcome {
  reviewed: boolean;
}

// sets the noslop check run of a pull request from what GitHub holds, with no new review, so a reply
// in a finding thread passes or fails the check
export async function checkPullRequest(
  pr: PullRequestRef,
  loadConnection: () => Promise<GitHubConnection>,
): Promise<PullRequestCheck> {
  const connection = await loadConnection();
  const state = await readPullRequestState(connection, pr);
  const outcome = await runGitHubCheck(connection, pr, { failedReporters: [], state });

  return { ...outcome, reviewed: state.summary?.marker.head === state.headSha };
}
