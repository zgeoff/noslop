import type { Disposition, PullRequestRef } from '@noslop/contract';
import type { CheckOutcome } from './build-check-outcome';
import { buildCheckOutcome } from './build-check-outcome';
import type { GitHubClient, GitHubConnection } from './create-github-connection';
import { readExistingIssues } from './read-existing-issues';
import { readNetChangeKey } from './read-net-change-key';
import type { PullRequestState } from './read-pull-request-state';
import { readThreadDispositions } from './read-thread-dispositions';
import { readUnreadFixes } from './read-unread-fixes';

export interface GitHubCheckInput {
  failedReporters: readonly string[];
  state: PullRequestState;
  issueKeys: readonly string[];

  dispositions?: readonly Disposition[];
}

export async function readGitHubCheck(
  connection: GitHubConnection,
  pr: PullRequestRef,
  input: GitHubCheckInput,
): Promise<CheckOutcome> {
  const client = connection.client;
  const state = input.state;

  const dispositions = await readCheckDispositions(client, pr, input);
  const existingIssues = await readExistingIssues(client, pr, dispositions, input.issueKeys);

  const summary = state.summary?.marker ?? null;

  const unread = await readUnreadFixes(client, pr, {
    dispositions,
    reviewHead: summary?.head ?? null,
    head: state.headSha,
  });

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
    unread,
    failedReporters: input.failedReporters,
    unreadable: state.unreadable,
  });
}

function readCheckDispositions(
  client: GitHubClient,
  pullRequest: PullRequestRef,
  input: GitHubCheckInput,
): Promise<readonly Disposition[]> {
  if (input.dispositions !== undefined) {
    return Promise.resolve(input.dispositions);
  }

  return readThreadDispositions(client, pullRequest, input.state.threads);
}
