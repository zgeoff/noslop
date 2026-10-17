import type { Disposition, PullRequestRef } from '@noslop/contract';
import type { GitHubClient } from './create-github-connection';
import type { FindingThread } from './read-pull-request-state';

// the findings whose latest disposition is `fixed` with a commit that changes the finding's file; a
// re-review covers only the commits since the reviewed head, so a finding it no longer reports counts
// as fixed only when the fix commit put its file in that delta
export async function readFixedFindings(
  client: GitHubClient,
  pr: PullRequestRef,
  threads: readonly FindingThread[],
  dispositions: readonly Disposition[],
): Promise<Set<string>> {
  const latest = new Map(dispositions.map((item) => [item.findingID, item]));
  const files = new Map<string, Promise<Set<string>>>();
  const fixed = new Set<string>();

  for (const thread of threads) {
    const disposition = latest.get(thread.marker.id);

    if (disposition?.kind !== 'fixed') {
      continue;
    }

    const changed = files.get(disposition.value) ?? readCommitFiles(client, pr, disposition.value);

    files.set(disposition.value, changed);

    const paths = await changed;

    if (paths.has(thread.marker.path)) {
      fixed.add(thread.marker.id);
    }
  }

  return fixed;
}

async function readCommitFiles(
  client: GitHubClient,
  pr: PullRequestRef,
  ref: string,
): Promise<Set<string>> {
  try {
    const response = await client.request('GET /repos/{owner}/{repo}/commits/{ref}', {
      owner: pr.owner,
      repo: pr.repo,
      ref,
    });

    return new Set((response.data.files ?? []).map((file) => file.filename));
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) {
      return new Set();
    }

    throw error;
  }
}
