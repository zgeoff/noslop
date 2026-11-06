import type { PullRequestRef } from '@noslop/contract';
import type { CheckOutcome } from '@noslop/github';
import { readGitHubCheck, readPullRequestState, runGitHubCheck } from '@noslop/github';
import { checkSameBase } from './check-same-base';
import type { GitHubConnectionLoader } from './create-github-connection-loader';
import { loadBaseConfig } from './load-base-config';
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
      failedReporters: [],
      state: trusted.state,
      issueKeys: trusted.config.issueKeys,
    });
  }

  const connection = await loader.load();

  if (connection.auth !== 'app') {
    throw new Error(
      'checking sets the check run as the App: set NOSLOP_GITHUB_APP_ID, NOSLOP_GITHUB_APP_PRIVATE_KEY and NOSLOP_GITHUB_APP_INSTALLATION_ID, or check with --read-only',
    );
  }

  const base = await loadBaseConfig(loader.load, pr);
  const state = await readPullRequestState(connection, pr);

  checkSameBase(base, state);

  return runGitHubCheck(connection, pr, {
    failedReporters: [],
    issueKeys: base.loaded.config.issueKeys,
    state,
  });
}
