import type { PullRequestRef } from '@noslop/contract';
import type { GitHubClient } from './create-github-connection';
import { formatStatus } from './format-status';
import type { CommitFile } from './has-skipped-file';
import { toCommitFile } from './to-commit-file';

export interface CommitFiles {
  files: CommitFile[];

  // why GitHub gave no whole file list, which the summary shows beside the unconfirmed fix
  failure: string | null;
}

// GitHub lists at most 3,000 files of one commit, 100 to a page
const COMMIT_FILES_PER_PAGE = 100;
const COMMIT_FILE_PAGES = 30;

// reads every file a commit changes from GitHub, page by page; a failed read, or a commit past
// GitHub's file cap, gives the failure in place of a whole list
export async function readCommitFiles(
  client: GitHubClient,
  pr: PullRequestRef,
  commit: string,
): Promise<CommitFiles> {
  const files: CommitFile[] = [];

  try {
    for (let page = 1; page <= COMMIT_FILE_PAGES; page += 1) {
      const response = await client.request('GET /repos/{owner}/{repo}/commits/{ref}', {
        owner: pr.owner,
        repo: pr.repo,
        ref: commit,
        per_page: COMMIT_FILES_PER_PAGE,
        page,
      });

      const listed = response.data.files ?? [];

      files.push(...listed.map((file) => toCommitFile(file)));

      if (listed.length < COMMIT_FILES_PER_PAGE) {
        return { files, failure: null };
      }
    }

    return { files, failure: 'the fix commit changes more files than GitHub lists' };
  } catch (error) {
    return {
      files,
      failure: `GitHub could not list the files of the fix commit (${formatStatus(error)})`,
    };
  }
}
