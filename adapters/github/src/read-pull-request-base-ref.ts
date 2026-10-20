import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection } from './create-github-connection';

// the name of the branch the pull request merges into, whose tip a review loads its config from before
// it reads the comments that config decides whether to trust
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
