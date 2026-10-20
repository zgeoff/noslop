import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection } from './create-github-connection';

// the commit at the tip of the branch the pull request merges into, which a review loads its config
// from before it reads the comments that config decides whether to trust
export async function readPullRequestBase(
  connection: GitHubConnection,
  pr: PullRequestRef,
): Promise<string> {
  const pull = await connection.client.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner: pr.owner,
    repo: pr.repo,
    pull_number: pr.number,
  });

  return pull.data.base.sha;
}
