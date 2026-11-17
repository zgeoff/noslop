import type { PullRequestRef } from '@noslop/contract';
import type { CheckOutcome } from '@noslop/github';
import { readGitHubCheck, readPullRequestState, runGitHubCheck } from '@noslop/github';
import { readDeferralPolicy } from '../config/read-deferral-policy';
import type { GitHubConnectionLoader } from '../context/create-github-connection-loader';
import { readTrustedState } from './read-trusted-state';

export type PullRequestCheck = CheckOutcome;

export interface CheckPullRequestOptions {
  readOnly: boolean;
}

export async function checkPullRequest(
  pr: PullRequestRef,
  loader: GitHubConnectionLoader,
  options: CheckPullRequestOptions,
): Promise<PullRequestCheck> {
  if (options.readOnly) {
    const trusted = await readTrustedState(pr, loader);

    return readGitHubCheck(trusted.connection, pr, {
      state: trusted.state,
      policy: { baseRef: trusted.state.baseRef, issueKeys: trusted.config.issueKeys },
    });
  }

  const connection = await loader.load();

  if (connection.auth !== 'app') {
    throw new Error(
      'checking sets the check run as the App: set NOSLOP_GITHUB_APP_ID, NOSLOP_GITHUB_APP_PRIVATE_KEY and NOSLOP_GITHUB_APP_INSTALLATION_ID, or check with --read-only',
    );
  }

  const policy = await readDeferralPolicy(loader.load, pr);
  const state = await readPullRequestState(connection, pr);

  return runGitHubCheck(connection, pr, { policy, state });
}
