import type { ReviewResult } from '@noslop/contract';
import type { AppOptions } from './app-options';
import { createGitHubConnectionLoader } from './create-github-connection-loader';
import { verifyReviewResult } from './verify-review-result';

export type { AppOptions } from './app-options';

export function verify(input: unknown, options: AppOptions): Promise<ReviewResult> {
  return verifyReviewResult(input, createGitHubConnectionLoader(options.env).load);
}
