import type { PullRequestRef } from '@noslop/contract';
import type { GitHubClient } from './create-github-connection';
import { readAllPages } from './read-all-pages';

// GitHub lists at most 3,000 files of a pull request
const PULL_REQUEST_FILES = 3000;

// the paths the pull request's diff changes, as GitHub lists them, with each rename's earlier path;
// a list at GitHub's cap may leave files out, so it gives null
export async function readPullRequestFiles(
  client: GitHubClient,
  pr: PullRequestRef,
): Promise<string[] | null> {
  const files = await readAllPages(async (page, perPage) => {
    const response = await client.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
      owner: pr.owner,
      repo: pr.repo,
      pull_number: pr.number,
      page,
      per_page: perPage,
    });

    return response.data;
  });

  if (files.length >= PULL_REQUEST_FILES) {
    return null;
  }

  return files.flatMap((file) =>
    file.previous_filename === undefined
      ? [file.filename]
      : [file.filename, file.previous_filename],
  );
}
