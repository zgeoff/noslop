import type { Disposition, PullRequestRef } from '@noslop/contract';
import type { GitHubClient } from './create-github-connection';

export interface FixCommitsInput {
  // the pull request's own commits, as GitHub lists them
  commits: readonly string[];
  dispositions: readonly Disposition[];
  head: string;
}

// the commits a `fixed` answer can name: the pull request's own, and each named commit the head holds
// through a merge from the base branch, which GitHub's commit list of the pull request leaves out
// since the base branch holds it too
export async function readFixCommits(
  client: GitHubClient,
  pr: PullRequestRef,
  input: FixCommitsInput,
): Promise<string[]> {
  const named = new Set(
    input.dispositions
      .filter((item) => item.kind === 'fixed')
      .map((item) => item.value)
      .filter((sha) => !input.commits.some((commit) => commit.startsWith(sha))),
  );

  const found = await Promise.all(
    [...named].map((sha) => findHeadCommit(client, pr, sha, input.head)),
  );

  return [...new Set([...input.commits, ...found.filter((sha) => sha !== null)])];
}

// the full sha of the commit a sha names when the head holds it: GitHub's compare of the commit with
// the head is ahead or identical, and its merge base is the commit itself; a sha that names no
// commit, or more than one, gives null
async function findHeadCommit(
  client: GitHubClient,
  pr: PullRequestRef,
  sha: string,
  head: string,
): Promise<string | null> {
  try {
    const response = await client.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
      owner: pr.owner,
      repo: pr.repo,
      basehead: `${sha}...${head}`,
    });

    const isHeld = response.data.status === 'ahead' || response.data.status === 'identical';

    return isHeld ? response.data.merge_base_commit.sha : null;
  } catch (error) {
    if (isMissingCommit(error)) {
      return null;
    }

    throw error;
  }
}

// GitHub answers a compare from a sha that names no commit with 404, and one that names several
// with 422
function isMissingCommit(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error.status === 404 || error.status === 422)
  );
}
