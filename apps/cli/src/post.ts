import { getLogger } from '@logtape/logtape';
import type { ReviewResult } from '@noslop/contract';
import type { AppOptions } from './app-options';
import { makeGitHubConnectionLoader } from './make-github-connection-loader';
import { sendReviewResult } from './send-review-result';

export type { AppOptions } from './app-options';

export interface PostOptions extends AppOptions {
  // false posts the result with no verification, as `noslop post --no-verify` does; true unless given
  verify?: boolean;
}

// `@noslop/cli/post`: sends a review result to its pull request as the App, as `noslop post` does; it
// verifies the result first, as `@noslop/cli/verify` does, and throws on one that does not verify
export function sendResult(input: unknown, options: PostOptions): Promise<ReviewResult> {
  return sendReviewResult(
    input,
    { loadConnection: makeGitHubConnectionLoader(options.env), logger: getLogger(['noslop']) },
    options.verify ?? true,
  );
}
