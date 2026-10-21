import type { Disposition, PullRequestRef } from '@noslop/contract';
import type { GitHubClient } from './create-github-connection';

export interface UnreadFixesInput {
  // every disposition of the pull request, oldest first; a finding's latest one counts
  dispositions: readonly Disposition[];

  // the head the latest review read, or null before any review
  reviewHead: string | null;
  head: string;
}

// the findings whose latest answer is `fixed <commit>` with a commit the pull request's head holds and
// the latest review's head does not, so that review never read the fix
export async function readUnreadFixes(
  client: GitHubClient,
  pr: PullRequestRef,
  input: UnreadFixesInput,
): Promise<Set<string>> {
  const reviewHead = input.reviewHead;

  if (reviewHead === null) {
    return new Set();
  }

  const latest = new Map(input.dispositions.map((item) => [item.findingID, item]));
  const unread = new Set<string>();
  const commits = new Map<string, boolean>();

  for (const disposition of latest.values()) {
    // a bare `fixed` names no commit, so nothing shows which review read its fix
    if (disposition.kind !== 'fixed' || disposition.value === '') {
      continue;
    }

    const commit = disposition.value;
    let isUnread = commits.get(commit);

    if (isUnread === undefined) {
      isUnread = await probeUnread(client, pr, commit, { reviewHead, head: input.head });

      commits.set(commit, isUnread);
    }

    if (isUnread) {
      unread.add(disposition.findingID);
    }
  }

  return unread;
}

interface Heads {
  reviewHead: string;
  head: string;
}

async function probeUnread(
  client: GitHubClient,
  pr: PullRequestRef,
  commit: string,
  heads: Heads,
): Promise<boolean> {
  const isRead = await probeAncestor(client, pr, commit, heads.reviewHead);

  if (isRead) {
    return false;
  }

  return probeAncestor(client, pr, commit, heads.head);
}

// GitHub's compare of a commit to a head is `ahead` or `identical` when the head holds the commit
async function probeAncestor(
  client: GitHubClient,
  pr: PullRequestRef,
  commit: string,
  head: string,
): Promise<boolean> {
  try {
    const response = await client.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
      owner: pr.owner,
      repo: pr.repo,
      basehead: `${commit}...${head}`,
      per_page: 1,
    });

    return response.data.status === 'ahead' || response.data.status === 'identical';
  } catch (error) {
    // a commit the repo does not hold, or one with no history in common with the head
    if (isMissingCommit(error)) {
      return false;
    }

    throw error;
  }
}

function isMissingCommit(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error.status === 404 || error.status === 422)
  );
}
