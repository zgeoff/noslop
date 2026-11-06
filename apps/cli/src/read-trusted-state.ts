import type { PullRequestRef, ReviewConfig } from '@noslop/contract';
import type { GitHubConnection, PullRequestState } from '@noslop/github';
import { readPullRequestState } from '@noslop/github';
import type { GitHubConnectionLoader } from './create-github-connection-loader';
import { loadBaseConfig } from './load-base-config';

export interface TrustedState {
  connection: GitHubConnection;
  state: PullRequestState;
  config: ReviewConfig;
}

export async function readTrustedState(
  pr: PullRequestRef,
  loader: GitHubConnectionLoader,
): Promise<TrustedState> {
  const untrusted = await loader.load();
  const base = await loadBaseConfig(loader.load, pr);

  const baseRef = base.baseRef;
  const appSlug = base.loaded.config.github.app;

  if (appSlug === null && untrusted.auth !== 'app') {
    throw new Error(
      `a read-only command trusts the comments of the App that github.app names, and the config on ${baseRef} names none: set github.app to the slug of the App that posts the reviews`,
    );
  }

  loader.setAppSlug(appSlug);

  const connection = await loader.load();
  const state = await readPullRequestState(connection, pr);

  if (state.baseRef !== baseRef) {
    throw new Error(
      `the base branch of the pull request changed from ${baseRef} to ${state.baseRef} during the read; run the command again`,
    );
  }

  return { connection, state, config: base.loaded.config };
}
