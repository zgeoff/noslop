import type { LoadedConfig } from '@noslop/config';
import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection } from '@noslop/github';
import { readBranchHead, readPullRequestBaseRef } from '@noslop/github';
import { loadCommitConfig } from './load-commit-config';

export interface BaseConfig {
  baseRef: string;
  loaded: LoadedConfig;
}

export async function loadBaseConfig(
  loadConnection: () => Promise<GitHubConnection>,
  pr: PullRequestRef,
): Promise<BaseConfig> {
  const connection = await loadConnection();
  const baseRef = await readPullRequestBaseRef(connection, pr);
  const commit = await readBranchHead(connection, pr, baseRef);

  return { baseRef, loaded: await loadCommitConfig(loadConnection, pr, commit) };
}
