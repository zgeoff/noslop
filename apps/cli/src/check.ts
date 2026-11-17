import type { PullRequestRef } from '@noslop/contract';
import type { PullRequestCheck } from './check-run/check-pull-request';
import { checkPullRequest } from './check-run/check-pull-request';
import type { AppOptions } from './context/app-options';
import { createGitHubConnectionLoader } from './context/create-github-connection-loader';

export type { AppOptions } from './context/app-options';
export type { PullRequestCheck } from './check-run/check-pull-request';

export interface CheckOptions extends AppOptions {
  readOnly?: boolean;
}

export function check(pr: PullRequestRef, options: CheckOptions): Promise<PullRequestCheck> {
  return checkPullRequest(pr, createGitHubConnectionLoader(options.env), {
    readOnly: options.readOnly ?? false,
  });
}
