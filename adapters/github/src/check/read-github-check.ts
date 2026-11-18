import type { Disposition, PullRequestRef } from '@noslop/contract';
import type { GitHubClient, GitHubConnection } from '../connection/create-github-connection';
import type { DeferralPolicy } from '../dispositions/deferral-policy';
import { readThreadDispositions } from '../dispositions/read-thread-dispositions';
import type { PullRequestState } from '../pull-request/read-pull-request-state';
import type { CheckOutcome } from './build-check-outcome';
import { buildCheckOutcome } from './build-check-outcome';
import { readExistingIssues } from './read-existing-issues';
import { readUnreadFixes } from './read-unread-fixes';

export interface GitHubCheckInput {
  state: PullRequestState;
  policy: DeferralPolicy;

  dispositions?: readonly Disposition[];
}

export async function readGitHubCheck(
  connection: GitHubConnection,
  pr: PullRequestRef,
  input: GitHubCheckInput,
): Promise<CheckOutcome> {
  const client = connection.client;
  const state = input.state;

  if (state.baseRef !== input.policy.baseRef) {
    throw new Error(
      `the base branch of the pull request moved from ${input.policy.baseRef} to ${state.baseRef} while noslop read its config; run the check again`,
    );
  }

  const dispositions = await readCheckDispositions(client, pr, input);
  const existingIssues = await readExistingIssues(client, pr, dispositions, input.policy.issueKeys);

  const summary = state.summary?.marker ?? null;

  const unread = await readUnreadFixes(client, pr, {
    dispositions,
    reviewHead: summary?.head ?? null,
    head: state.headSha,
  });

  return buildCheckOutcome({
    findings: state.threads.map((thread) => thread.marker),
    dispositions,
    summary,
    existingIssues,
    unread,
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
