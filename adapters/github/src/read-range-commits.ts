import type { PullRequestRef } from '@noslop/contract';
import type { GitHubClient } from './create-github-connection';

// the commits after the base up to the head; a base that GitHub no longer holds, such as a head that
// a force push dropped, gives none, so no fix counts through it
export async function readRangeCommits(
  client: GitHubClient,
  pr: PullRequestRef,
  base: string,
  head: string,
): Promise<string[]> {
  try {
    const response = await client.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
      owner: pr.owner,
      repo: pr.repo,
      basehead: `${base}...${head}`,
    });

    return response.data.commits.map((commit) => commit.sha);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) {
      return [];
    }

    throw error;
  }
}
