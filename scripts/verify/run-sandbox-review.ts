import { reviewResultSchema } from '@noslop/contract';
import { WringerError } from '@wringer/core';
import type { SandboxEnv } from './parse-sandbox-env.ts';
import { readOpenRunState } from './read-open-run-state.ts';
import type { RunEndpoints } from './run-endpoints.ts';
import { runNoslop } from './run-noslop.ts';

export type ReviewMode = 'full' | 'fixes-only';

const reviewArgsByMode = { full: [], 'fixes-only': ['--fixes-only'] } as const satisfies Record<
  ReviewMode,
  readonly string[]
>;

// Reviews the run's pull request as the App, which posts the findings and sets the check run. A
// failed model call fails the action, because the journey's end state would then test nothing.
export async function runSandboxReview(
  endpoints: RunEndpoints,
  sandbox: SandboxEnv,
  mode: ReviewMode,
): Promise<{ pullRequest: number; findings: number; fixChecks: number }> {
  const state = await readOpenRunState(endpoints);

  const result = await runNoslop(
    endpoints,
    [
      'review',
      '--pr',
      String(state.pullRequest),
      '--repo',
      `${sandbox.owner}/${sandbox.repo}`,
      '--report',
      'github',
      '--json',
      ...reviewArgsByMode[mode],
    ],
    { token: sandbox.token, timeoutMs: 600_000 },
  );

  const review = reviewResultSchema.parse(JSON.parse(result.stdout));

  if (review.failedCalls.length > 0) {
    throw new WringerError('check-failed', {
      message: `the review had ${String(review.failedCalls.length)} failed model calls`,
      data: { failedCalls: review.failedCalls },
    });
  }

  return {
    pullRequest: state.pullRequest,
    findings: review.findings.length,
    fixChecks: review.fixChecks?.length ?? 0,
  };
}
