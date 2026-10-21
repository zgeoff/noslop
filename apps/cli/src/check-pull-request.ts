import type { PullRequestRef } from '@noslop/contract';
import type { CheckOutcome } from '@noslop/github';
import { readGitHubCheck, readPullRequestState, runGitHubCheck } from '@noslop/github';
import type { GitHubConnectionLoader } from './create-github-connection-loader';
import { readTrustedState } from './read-trusted-state';

export type PullRequestCheck = CheckOutcome;

export interface CheckPullRequestOptions {
  // true reads the outcome and writes nothing to GitHub, so a CI job checks with its own token
  readOnly: boolean;
}

// sets the noslop check run of a pull request from what GitHub holds, with no new review, so a reply
// in a finding thread passes or fails the check; read-only, it returns the same outcome and sets
// nothing
export async function checkPullRequest(
  pr: PullRequestRef,
  loader: GitHubConnectionLoader,
  options: CheckPullRequestOptions,
): Promise<PullRequestCheck> {
  if (options.readOnly) {
    const trusted = await readTrustedState(pr, loader);

    return readGitHubCheck(trusted.connection, pr, {
      failedReporters: [],
      state: trusted.state,
    });
  }

  const connection = await loader.load();

  if (connection.auth !== 'app') {
    throw new Error(
      'checking sets the check run as the App: set NOSLOP_GITHUB_APP_ID, NOSLOP_GITHUB_APP_PRIVATE_KEY and NOSLOP_GITHUB_APP_INSTALLATION_ID, or check with --read-only',
    );
  }

  const state = await readPullRequestState(connection, pr);

  return runGitHubCheck(connection, pr, { failedReporters: [], state });
}
