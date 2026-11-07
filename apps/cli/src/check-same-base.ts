import type { PullRequestState } from '@noslop/github';
import type { BaseConfig } from './load-base-config';

export function checkSameBase(base: BaseConfig, state: PullRequestState): void {
  if (state.baseRef !== base.baseRef) {
    throw new Error(
      `the base branch of the pull request changed from ${base.baseRef} to ${state.baseRef} during the read; run the command again`,
    );
  }
}
