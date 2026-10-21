import type { PullRequestRef } from '@noslop/contract';
import type { GitHubClient } from './create-github-connection';
import { makeCommitChangeReader } from './make-commit-change-reader';

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
// commit by its sha, and the one branch commit with the same patch to the same files is its rewrite
export function makeRewrittenFixReader(
  client: GitHubClient,
  pr: PullRequestRef,
): (input: RewrittenFixInput) => Promise<RewrittenFix> {
  const readCached = makeCommitChangeReader(client, pr);

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
      const isAfter = await readDescendsFrom(client, pr, input.posted, named.sha);

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

// reads from GitHub whether the commit descends from the ancestor: the compare lists a commit of a
// diverged fork too, so only its `ahead` status shows the ancestry; a lost ancestor shows none
async function readDescendsFrom(
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
