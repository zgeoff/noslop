import type { PullRequestRef } from '@noslop/contract';
import type { GitHubClient } from './create-github-connection';
import { expandSkippedPaths } from './expand-skipped-paths';
import type { CommitFile } from './has-skipped-file';
import { hasSkippedFile } from './has-skipped-file';

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

interface ReadCommitFiles {
  files: CommitFile[];

  // why GitHub gave no whole file list, which the summary shows beside the unconfirmed fix
  failure: string | null;
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
): Promise<ReadCommitFiles> {
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

// GitHub lists at most 3,000 files of one commit, 100 to a page
const COMMIT_FILES_PER_PAGE = 100;
const COMMIT_FILE_PAGES = 30;

// reads every file a commit changes from GitHub, page by page; a failed read, or a commit past
// GitHub's file cap, gives the failure in place of a whole list
async function readCommitFiles(
  client: GitHubClient,
  pr: PullRequestRef,
  commit: string,
): Promise<ReadCommitFiles> {
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

// GitHub's entry for a changed file holds more fields than the coverage check reads
function toCommitFile(file: CommitFile): CommitFile {
  return file.previous_filename === undefined
    ? { filename: file.filename }
    : { filename: file.filename, previous_filename: file.previous_filename };
}

// the HTTP status of a failed GitHub request, or the error itself when it carries none
function formatStatus(error: unknown): string {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? `HTTP ${error.status}`
    : String(error);
}
