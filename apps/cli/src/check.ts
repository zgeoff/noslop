import type { PullRequestRef } from '@noslop/contract';
import type { AppOptions } from './app-options';
import type { PullRequestCheck } from './check-pull-request';
import { checkPullRequest } from './check-pull-request';
import { createGitHubConnectionLoader } from './create-github-connection-loader';

export type { AppOptions } from './app-options';
export type { PullRequestCheck } from './check-pull-request';

// `@noslop/cli/check`: sets the noslop check run of a pull request as the App, as `noslop check` does,
// and returns its outcome; `reviewed` is false when no noslop review covers the pull request's head
export function check(pr: PullRequestRef, options: AppOptions): Promise<PullRequestCheck> {
  return checkPullRequest(pr, createGitHubConnectionLoader(options.env).load);
}
