import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection, PullRequestState } from '@noslop/github';
import { readBranchHead, readPullRequestBaseRef, readPullRequestState } from '@noslop/github';
import type { GitHubConnectionLoader } from './create-github-connection-loader';
import { loadCommitConfig } from './load-commit-config';

export interface TrustedState {
  connection: GitHubConnection;
  state: PullRequestState;
}

// a token knows no App, so the comments it trusts are those of the App the base branch's config
// names; the config loads from the branch's tip, as verify loads it
export async function readTrustedState(
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

  return { connection, state };
}
