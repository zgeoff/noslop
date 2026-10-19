import type { PullRequestRef } from '@noslop/contract';
import type { GitHubClient } from './create-github-connection';
import { expandSkippedPaths } from './expand-skipped-paths';
import { formatStatus } from './format-status';
import { hasSkippedFile } from './has-skipped-file';
import type { CommitFiles } from './read-commit-files';
import { readCommitFiles } from './read-commit-files';
import { toCommitFile } from './to-commit-file';

export interface FixCoverage {
  changesSkipped: boolean;

  // why GitHub gave no whole file list, which the summary shows beside the unconfirmed fix
  failure: string | null;
}

export interface FixCoverageInput {
  commit: string;
  head: string;
  skipped: ReadonlySet<string>;
  findingPath: string;
}

// whether the fix commit, or the finding's file, reaches a file the review left out: the fix commit's
// own files and renames, and each rename after the fix up to the head, which moves a fixed file into
// a skipped path; a file list GitHub could not give whole counts as one that does
export async function readFixCoverage(
  client: GitHubClient,
  pr: PullRequestRef,
  input: FixCoverageInput,
): Promise<FixCoverage> {
  const later = await readCompareFiles(client, pr, input.commit, input.head);

  const fix = later.failure === null ? await readCommitFiles(client, pr, input.commit) : later;
  const failure = later.failure ?? fix.failure;

  if (failure !== null) {
    return { changesSkipped: true, failure };
  }

  const paths = expandSkippedPaths(input.skipped, later.files);

  return {
    changesSkipped: paths.has(input.findingPath) || hasSkippedFile(fix.files, paths),
    failure: null,
  };
}

// GitHub's compare lists at most 300 files of a range
const COMPARE_FILES = 300;

// reads the files a range of commits changes from GitHub's compare, with each rename's earlier path;
// a failed read, or a range past the compare's file cap, gives the failure in place of a whole list
async function readCompareFiles(
  client: GitHubClient,
  pr: PullRequestRef,
  base: string,
  head: string,
): Promise<CommitFiles> {
  // a fix at the head has no later commit to rename its file
  if (base === head) {
    return { files: [], failure: null };
  }

  try {
    const response = await client.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
      owner: pr.owner,
      repo: pr.repo,
      basehead: `${base}...${head}`,
    });

    const files = (response.data.files ?? []).map((file) => toCommitFile(file));

    return files.length >= COMPARE_FILES
      ? { files, failure: 'the commits after the fix change more files than GitHub lists' }
      : { files, failure: null };
  } catch (error) {
    return {
      files: [],
      failure: `GitHub could not compare the fix commit with the head (${formatStatus(error)})`,
    };
  }
}
