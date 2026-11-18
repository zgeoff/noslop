import type { PullRequestRef } from '@noslop/contract';

export interface DeferralPolicy {
  baseRef: string;
  issueKeys: readonly string[];
}

export type ReadDeferralPolicy = (pr: PullRequestRef) => Promise<DeferralPolicy>;
