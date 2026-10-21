import type { PullRequestRef } from '@noslop/contract';
import type { PullRequestFile } from './build-net-change-key';
import { buildNetChangeKey } from './build-net-change-key';
import type { GitHubClient } from './create-github-connection';
import type { NetChangeKey } from './net-change-key';

// GitHub lists at most 3,000 files of a pull request, 100 to a page
const PULL_FILES_PER_PAGE = 100;
const PULL_FILE_PAGES = 30;

// the key of a pull request's net change at a head, from the patches GitHub lists for its files; the
// list is of the pull request's head now, so a head that moved on keys on the head it was given
export async function readNetChangeKey(
  client: GitHubClient,
  pr: PullRequestRef,
  head: string,
): Promise<NetChangeKey> {
  const files: PullRequestFile[] = [];

  for (let page = 1; page <= PULL_FILE_PAGES; page += 1) {
    const response = await client.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
      owner: pr.owner,
      repo: pr.repo,
      pull_number: pr.number,
      per_page: PULL_FILES_PER_PAGE,
      page,
    });

    files.push(...response.data.map((file) => toPullRequestFile(file)));

    if (response.data.length < PULL_FILES_PER_PAGE) {
      break;
    }
  }

  const pull = await client.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner: pr.owner,
    repo: pr.repo,
    pull_number: pr.number,
  });

  if (pull.data.head.sha !== head) {
    return { head };
  }

  return buildNetChangeKey({ head, files, isWhole: files.length === pull.data.changed_files });
}

// GitHub's entry holds more fields than the key reads
function toPullRequestFile(file: PullRequestFile): PullRequestFile {
  return {
    filename: file.filename,
    status: file.status,
    sha: file.sha,
    ...(file.previous_filename === undefined ? {} : { previous_filename: file.previous_filename }),
    ...(file.patch === undefined ? {} : { patch: file.patch }),
  };
}
