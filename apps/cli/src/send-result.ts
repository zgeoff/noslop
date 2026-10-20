import { getLogger } from '@logtape/logtape';
import type { ReviewResult } from '@noslop/contract';
import type { AppOptions } from './app-options';
import { createGitHubConnectionLoader } from './create-github-connection-loader';
import { sendReviewResult } from './send-review-result';

export type { AppOptions } from './app-options';

export interface PostOptions extends AppOptions {
  // false posts the result with no verification, as `noslop post --no-verify` does; true unless given
  verify?: boolean;
}

// `@noslop/cli/post`: sends a review result to its pull request as the App, as `noslop post` does; it
// verifies the result first unless `verify` is false, and throws on one that does not verify before it
// posts anything
export function sendResult(input: unknown, options: PostOptions): Promise<ReviewResult> {
  return sendReviewResult(
    input,
    {
      loadConnection: createGitHubConnectionLoader(options.env).load,
      logger: getLogger(['noslop']),
    },
    options.verify ?? true,
  );
}
