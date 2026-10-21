import type { FindingList, PullRequestRef } from '@noslop/contract';
import { buildFindingList } from './build-finding-list';
import type { GitHubConnection } from './create-github-connection';
import type { PullRequestState } from './read-pull-request-state';
import { readThreadDispositions } from './read-thread-dispositions';

export async function readFindingList(
  connection: GitHubConnection,
  pr: PullRequestRef,
  state: PullRequestState,
): Promise<FindingList> {
  const dispositions = await readThreadDispositions(connection.client, pr, state.threads);

  return buildFindingList({
    findings: state.threads.map((thread) => thread.marker),
    dispositions,
    confirmed: state.summary?.marker.confirmed ?? [],
  });
}
