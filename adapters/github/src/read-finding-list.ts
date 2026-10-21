import type { FindingList, PullRequestRef } from '@noslop/contract';
import { buildFindingList } from './build-finding-list';
import type { GitHubConnection } from './create-github-connection';
import { readExistingIssues } from './read-existing-issues';
import type { PullRequestState } from './read-pull-request-state';
import { readThreadDispositions } from './read-thread-dispositions';

export async function readFindingList(
  connection: GitHubConnection,
  pr: PullRequestRef,
  state: PullRequestState,
): Promise<FindingList> {
  const dispositions = await readThreadDispositions(connection.client, pr, state.threads);
  const existingIssues = await readExistingIssues(connection.client, pr, dispositions);

  return buildFindingList({
    findings: state.threads.map((thread) => thread.marker),
    dispositions,
    reported: state.summary?.marker.reported ?? [],
    confirmed: state.summary?.marker.confirmed ?? [],
    existingIssues,
  });
}
