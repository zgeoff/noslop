import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection } from './create-github-connection';

export async function readPullRequestBaseRef(
  connection: GitHubConnection,
  pr: PullRequestRef,
): Promise<string> {
  const pull = await connection.client.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner: pr.owner,
    repo: pr.repo,
    pull_number: pr.number,
  });

  return pull.data.base.ref;
}
