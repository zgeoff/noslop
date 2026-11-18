import type { FindingList, PullRequestRef } from '@noslop/contract';
import { readExistingIssues } from '../check/read-existing-issues';
import { readUnreadFixes } from '../check/read-unread-fixes';
import type { GitHubConnection } from '../connection/create-github-connection';
import { readThreadDispositions } from '../dispositions/read-thread-dispositions';
import type { PullRequestState } from '../pull-request/read-pull-request-state';
import { buildFindingList } from './build-finding-list';

export async function readFindingList(
  connection: GitHubConnection,
  pr: PullRequestRef,
  state: PullRequestState,
  issueKeys: readonly string[],
): Promise<FindingList> {
  const dispositions = await readThreadDispositions(connection.client, pr, state.threads);
  const existingIssues = await readExistingIssues(connection.client, pr, dispositions, issueKeys);

  const unread = await readUnreadFixes(connection.client, pr, {
    dispositions,
    reviewHead: state.summary?.marker.head ?? null,
    head: state.headSha,
  });

  return buildFindingList({
    findings: state.threads.map((thread) => thread.marker),
    dispositions,
    reported: state.summary?.marker.reported ?? [],
    confirmed: state.summary?.marker.confirmed ?? [],
    unjudged: state.summary?.marker.unjudged ?? [],
    existingIssues,
    unread,
  });
}
