import { getLogger } from '@logtape/logtape';
import type { ReviewResult } from '@noslop/contract';
import type { AppOptions } from './app-options';
import { createGitHubConnectionLoader } from './create-github-connection-loader';
import { sendReviewResult } from './send-review-result';

export type { AppOptions } from './app-options';

export interface PostOptions extends AppOptions {
  verify?: boolean;
}

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
