import type { Logger } from '@logtape/logtape';
import type { ReviewResult } from '@noslop/contract';
import { reviewResultSchema } from '@noslop/contract';
import type { GitHubConnection } from '@noslop/github';
import { createGitHubReporter } from '@noslop/github';
import { verifyReviewResult } from './verify-review-result';

export interface SendDependencies {
  loadConnection: () => Promise<GitHubConnection>;
  logger: Logger;
}

// posts a review result as the App through the GitHub reporter, which counts a second post of one
// result, such as a retry, as one review; it verifies the result first and refuses one that does not
// verify, unless the caller turns verification off
export async function sendReviewResult(
  input: unknown,
  deps: SendDependencies,
  shouldVerify: boolean,
): Promise<ReviewResult> {
  const result = shouldVerify
    ? await verifyBeforeSend(input, deps.loadConnection)
    : reviewResultSchema.parse(input);

  if (result.pullRequest === null) {
    throw new Error(
      'the result reviews no pull request, so it has nowhere to post: review with --pr',
    );
  }

  const connection = await deps.loadConnection();

  if (connection.appLogin === null) {
    throw new Error(
      'posting needs the App: set NOSLOP_GITHUB_APP_ID, NOSLOP_GITHUB_APP_PRIVATE_KEY and NOSLOP_GITHUB_APP_INSTALLATION_ID',
    );
  }

  const reporter = createGitHubReporter({ loadConnection: deps.loadConnection });

  await reporter.report(result, { logger: deps.logger, options: {}, failedReporters: [] });

  return result;
}

async function verifyBeforeSend(
  input: unknown,
  loadConnection: () => Promise<GitHubConnection>,
): Promise<ReviewResult> {
  try {
    return await verifyReviewResult(input, loadConnection);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(`noslop posts only a verified result, so it refuses this one: ${reason}`, {
      cause: error,
    });
  }
}
