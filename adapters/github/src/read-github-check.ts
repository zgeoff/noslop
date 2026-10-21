import type { PullRequestRef } from '@noslop/contract';
import type { CheckOutcome } from './build-check-outcome';
import { buildCheckOutcome } from './build-check-outcome';
import type { GitHubConnection } from './create-github-connection';
import { readExistingIssues } from './read-existing-issues';
import { readNetChangeKey } from './read-net-change-key';
import type { PullRequestState } from './read-pull-request-state';
import { readThreadDispositions } from './read-thread-dispositions';

export interface GitHubCheckInput {
  failedReporters: readonly string[];
  state: PullRequestState;
}

// the outcome of the check from what GitHub holds, with no write: it reads every disposition, checks
// each deferral's issue, and passes or fails the check
export async function readGitHubCheck(
  connection: GitHubConnection,
  pr: PullRequestRef,
  input: GitHubCheckInput,
): Promise<CheckOutcome> {
  const client = connection.client;
  const state = input.state;

  const dispositions = await readThreadDispositions(client, pr, state.threads);
  const existingIssues = await readExistingIssues(client, pr, dispositions);

  const summary = state.summary?.marker ?? null;

  const currentKey =
    summary?.key === undefined
      ? { head: state.headSha }
      : await readNetChangeKey(client, pr, state.headSha);

  return buildCheckOutcome({
    findings: state.threads.map((thread) => thread.marker),
    dispositions,
    summary,
    currentHead: state.headSha,
    currentKey,
    existingIssues,
    failedReporters: input.failedReporters,
    unreadable: state.unreadable,
  });
}
