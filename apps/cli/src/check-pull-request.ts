import type { PullRequestRef } from '@noslop/contract';
import type { CheckOutcome, GitHubConnection, PullRequestState } from '@noslop/github';
import {
  readBranchHead,
  readGitHubCheck,
  readPullRequestBaseRef,
  readPullRequestState,
  runGitHubCheck,
} from '@noslop/github';
import type { GitHubConnectionLoader } from './create-github-connection-loader';
import { loadCommitConfig } from './load-commit-config';

export interface PullRequestCheck extends CheckOutcome {
  reviewed: boolean;
}

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

    const outcome = await readGitHubCheck(trusted.connection, pr, {
      failedReporters: [],
      state: trusted.state,
    });

    return { ...outcome, reviewed: isReviewed(trusted.state) };
  }

  const connection = await loader.load();

  if (connection.auth !== 'app') {
    throw new Error(
      'checking sets the check run as the App: set NOSLOP_GITHUB_APP_ID, NOSLOP_GITHUB_APP_PRIVATE_KEY and NOSLOP_GITHUB_APP_INSTALLATION_ID, or check with --read-only',
    );
  }

  const state = await readPullRequestState(connection, pr);
  const outcome = await runGitHubCheck(connection, pr, { failedReporters: [], state });

  return { ...outcome, reviewed: isReviewed(state) };
}

interface TrustedState {
  connection: GitHubConnection;
  state: PullRequestState;
}

// a token knows no App, so the comments it trusts are those of the App the base branch's config
// names; the config loads from the branch's tip, as verify loads it
async function readTrustedState(
  pr: PullRequestRef,
  loader: GitHubConnectionLoader,
): Promise<TrustedState> {
  const untrusted = await loader.load();
  const baseRef = await readPullRequestBaseRef(untrusted, pr);
  const configCommit = await readBranchHead(untrusted, pr, baseRef);
  const loaded = await loadCommitConfig(loader.load, pr, configCommit);

  const appSlug = loaded.config.github.app;

  if (appSlug === null && untrusted.auth !== 'app') {
    throw new Error(
      `a read-only check trusts the comments of the App that github.app names, and the config on ${baseRef} names none: set github.app to the slug of the App that posts the reviews`,
    );
  }

  loader.setAppSlug(appSlug);

  const connection = await loader.load();
  const state = await readPullRequestState(connection, pr);

  if (state.baseRef !== baseRef) {
    throw new Error(
      `the base branch of the pull request changed from ${baseRef} to ${state.baseRef} during the check; check it again`,
    );
  }

  return { connection, state };
}

function isReviewed(state: PullRequestState): boolean {
  return state.summary?.marker.head === state.headSha;
}
