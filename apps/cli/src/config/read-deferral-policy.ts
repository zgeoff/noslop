import type { PullRequestRef } from '@noslop/contract';
import type { DeferralPolicy, GitHubConnection } from '@noslop/github';
import { loadBaseConfig } from './load-base-config';

export async function readDeferralPolicy(
  loadConnection: () => Promise<GitHubConnection>,
  pr: PullRequestRef,
): Promise<DeferralPolicy> {
  const base = await loadBaseConfig(loadConnection, pr);

  return { baseRef: base.baseRef, issueKeys: base.loaded.config.issueKeys };
}
