import type { PullRequestRef, ReviewConfig } from '@noslop/contract';
import type { GitHubConnection, PullRequestState } from '@noslop/github';
import { readPullRequestState } from '@noslop/github';
import { checkSameBase } from './check-same-base';
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

  const appSlug = base.loaded.config.github.app;

  if (appSlug === null && untrusted.auth !== 'app') {
    throw new Error(
      `a read-only command trusts the comments of the App that github.app names, and the config on ${base.baseRef} names none: set github.app to the slug of the App that posts the reviews`,
    );
  }

  loader.setAppSlug(appSlug);

  const connection = await loader.load();
  const state = await readPullRequestState(connection, pr);

  checkSameBase(base, state);

  return { connection, state, config: base.loaded.config };
}
