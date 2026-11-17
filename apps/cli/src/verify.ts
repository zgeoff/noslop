import type { ReviewResult } from '@noslop/contract';
import type { AppOptions } from './context/app-options';
import { createGitHubConnectionLoader } from './context/create-github-connection-loader';
import { verifyReviewResult } from './result/verify-review-result';

export type { AppOptions } from './context/app-options';

export function verify(input: unknown, options: AppOptions): Promise<ReviewResult> {
  return verifyReviewResult(input, createGitHubConnectionLoader(options.env).load);
}
