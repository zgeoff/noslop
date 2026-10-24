import type { ReviewResult } from '@noslop/contract';
import { reviewResultSchema } from '@noslop/contract';
import type { GitHubConnection } from '@noslop/github';
import { readBranchHead, readPullRequestState } from '@noslop/github';
import { loadCommitConfig } from './load-commit-config';

export async function verifyReviewResult(
  input: unknown,
  loadConnection: () => Promise<GitHubConnection>,
): Promise<ReviewResult> {
  const result = reviewResultSchema.parse(input);
  const pr = result.pullRequest;

  if (pr === null) {
    throw new Error('the result reviews no pull request, so it cannot verify: review with --pr');
  }

  const connection = await loadConnection();
  const state = await readPullRequestState(connection, pr);
  const baseCommit = await readBranchHead(connection, pr, state.baseRef);
  const loaded = await loadCommitConfig(loadConnection, pr, baseCommit);

  const problems: string[] = [];

  if (result.head !== state.headSha) {
    problems.push(
      `it reviews ${result.head.slice(0, 12)}, but the head of the pull request is ${state.headSha.slice(0, 12)}`,
    );
  }

  if (result.configHash !== loaded.hash) {
    problems.push(
      `its config hash ${result.configHash} differs from ${loaded.hash}, the hash of the config on ${state.baseRef}`,
    );
  }

  const appSlug = loaded.config.github.app;

  if (connection.auth === 'app' && appSlug !== null && connection.appLogin !== `${appSlug}[bot]`) {
    problems.push(
      `the config on ${state.baseRef} names the App ${appSlug}, but the App's keys belong to ${connection.appLogin ?? 'no App'}`,
    );
  }

  if (problems.length > 0) {
    throw new Error(`the result does not verify: ${problems.join('; ')}`);
  }

  return result;
}
