import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection } from './create-github-connection';

export async function readBranchHead(
  connection: GitHubConnection,
  pr: PullRequestRef,
  branch: string,
): Promise<string> {
  const response = await connection.client.request('GET /repos/{owner}/{repo}/branches/{branch}', {
    owner: pr.owner,
    repo: pr.repo,
    branch,
  });

  return response.data.commit.sha;
}
