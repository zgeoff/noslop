import type { ReviewResult } from '@noslop/contract';
import type { AppOptions } from './app-options';
import { makeGitHubConnectionLoader } from './make-github-connection-loader';
import { verifyReviewResult } from './verify-review-result';

export type { AppOptions } from './app-options';

// `@noslop/cli/verify`: parses a review result and checks it against its pull request, as
// `noslop verify` does; it returns the parsed result, and throws naming each mismatch when the result
// does not review the pull request's head or its config hash differs from the base branch's config
export function verify(input: unknown, options: AppOptions): Promise<ReviewResult> {
  return verifyReviewResult(input, makeGitHubConnectionLoader(options.env));
}
