import type { PullRequestRef } from '@noslop/contract';
import type { GitHubClient } from './create-github-connection';
import { readAllPages } from './read-all-pages';

export interface CommitChange {
  sha: string;

  // the commit's patches with no line numbers, which a rebase shifts; null when GitHub leaves a patch
  // out, such as for a binary or a large file, or lists only part of the commit's files
  fingerprint: string | null;
}

// a reader of each commit's patches with the line numbers cut, so a commit and the commit a rebase
// made of it compare equal; it reads each commit once, since one check asks for the same commits per
// finding and per review
export function makeCommitChangeReader(
  client: GitHubClient,
  pr: PullRequestRef,
): (ref: string) => Promise<CommitChange | null> {
  const changes = new Map<string, Promise<CommitChange | null>>();

  return (ref) => {
    const change = changes.get(ref) ?? readCommitChange(client, pr, ref);

    changes.set(ref, change);

    return change;
  };
}

interface PatchedFile {
  filename: string;
  previous_filename?: string;
  patch?: string;
}

// GitHub lists at most 3,000 files of one commit
const COMMIT_FILES = 3000;

// the commit GitHub serves for a ref, or null when GitHub holds none
async function readCommitChange(
  client: GitHubClient,
  pr: PullRequestRef,
  ref: string,
): Promise<CommitChange | null> {
  let sha = '';

  try {
    const files = await readAllPages(async (page, perPage) => {
      const response = await client.request('GET /repos/{owner}/{repo}/commits/{ref}', {
        owner: pr.owner,
        repo: pr.repo,
        ref,
        per_page: perPage,
        page,
      });

      sha = response.data.sha;

      return (response.data.files ?? []).map((file): PatchedFile => file);
    });

    return {
      sha,
      fingerprint:
        files.length === 0 || files.length >= COMMIT_FILES ? null : buildFingerprint(files),
    };
  } catch (error) {
    if (isUnknownCommit(error)) {
      return null;
    }

    throw error;
  }
}

// each file's path, earlier path and patch, in path order, with each hunk header's line numbers cut
function buildFingerprint(files: readonly PatchedFile[]): string | null {
  if (files.some((file) => file.patch === undefined)) {
    return null;
  }

  return files
    .map((file) =>
      [
        `${file.previous_filename ?? file.filename} ${file.filename}`,
        (file.patch ?? '').replaceAll(/^@@ [^@]* @@/gmu, '@@'),
      ].join('\n'),
    )
    .toSorted()
    .join('\n');
}

// GitHub answers 404 for a sha it holds no commit of, and 422 for a sha it cannot resolve
function isUnknownCommit(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error.status === 404 || error.status === 422)
  );
}
