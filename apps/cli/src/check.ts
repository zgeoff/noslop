import type { PullRequestRef } from '@noslop/contract';
import type { AppOptions } from './app-options';
import type { PullRequestCheck } from './check-pull-request';
import { checkPullRequest } from './check-pull-request';
import { createGitHubConnectionLoader } from './create-github-connection-loader';

export type { AppOptions } from './app-options';
export type { PullRequestCheck } from './check-pull-request';

export interface CheckOptions extends AppOptions {
  readOnly?: boolean;
}

export function check(pr: PullRequestRef, options: CheckOptions): Promise<PullRequestCheck> {
  return checkPullRequest(pr, createGitHubConnectionLoader(options.env), {
    readOnly: options.readOnly ?? false,
  });
}
