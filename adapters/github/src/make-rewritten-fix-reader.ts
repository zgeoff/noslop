import type { PullRequestRef } from '@noslop/contract';
import type { GitHubClient } from './create-github-connection';
import { readAllPages } from './read-all-pages';

export interface RewrittenFixInput {
  // the sha a `fixed` disposition names, which no commit on the branch starts with
  sha: string;

  // the head of the review that posted the finding, when its marker keeps one
  posted: string | undefined;

  // the branch commits that may hold the rewritten fix
  candidates: readonly string[];
}

export interface RewrittenFix {
  // the branch commit that holds the same change as the named commit
  commit: string | null;

  // why no branch commit stands in for the named commit, which the log shows beside the open fix
  failure: string | null;
}

// a reader that finds the commit a rebase made of a `fixed` commit: GitHub still serves the named
// commit by its sha, and the one branch commit with the same patch to the same files is its rewrite;
// it reads each commit's patches once, since one review asks for the same candidates per finding
export function makeRewrittenFixReader(
  client: GitHubClient,
  pr: PullRequestRef,
): (input: RewrittenFixInput) => Promise<RewrittenFix> {
  const changes = new Map<string, Promise<CommitChange | null>>();

  const readCached = (ref: string): Promise<CommitChange | null> => {
    const change = changes.get(ref) ?? readCommitChange(client, pr, ref);

    changes.set(ref, change);

    return change;
  };

  return async (input) => {
    const named = await readCached(input.sha);

    if (named === null) {
      return { commit: null, failure: `GitHub holds no commit ${input.sha}` };
    }

    if (named.fingerprint === null) {
      return { commit: null, failure: `GitHub gives no whole patch of the commit ${input.sha}` };
    }

    // a full review after a rebase sees every rewritten commit as new, so the named commit itself must
    // come after the head that posted the finding
    if (input.posted !== undefined) {
      const isAfter = await isDescendant(client, pr, input.posted, named.sha);

      if (!isAfter) {
        return {
          commit: null,
          failure: `the commit ${input.sha} does not come after the review that posted the finding`,
        };
      }
    }

    const changed = await Promise.all(input.candidates.map((candidate) => readCached(candidate)));

    const matches = changed.flatMap((change) =>
      change !== null && change.fingerprint === named.fingerprint ? [change.sha] : [],
    );

    if (matches.length !== 1) {
      return {
        commit: null,
        failure: `${matches.length} commits on the branch hold the change of the commit ${input.sha}`,
      };
    }

    return { commit: matches[0] ?? null, failure: null };
  };
}

interface CommitChange {
  sha: string;

  // the commit's patches with no line numbers, which a rebase shifts; null when GitHub leaves a patch
  // out, such as for a binary or a large file, or lists only part of the commit's files
  fingerprint: string | null;
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

// whether the commit descends from the ancestor: GitHub's compare lists a commit of a diverged fork
// too, so only its `ahead` status shows the ancestry; an ancestor GitHub no longer holds shows none
async function isDescendant(
  client: GitHubClient,
  pr: PullRequestRef,
  ancestor: string,
  commit: string,
): Promise<boolean> {
  try {
    const response = await client.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
      owner: pr.owner,
      repo: pr.repo,
      basehead: `${ancestor}...${commit}`,
    });

    return response.data.status === 'ahead';
  } catch (error) {
    if (isUnknownCommit(error)) {
      return false;
    }

    throw error;
  }
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
