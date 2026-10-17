import type { Disposition, PullRequestRef } from '@noslop/contract';
import type { GitHubClient } from './create-github-client';
import { parseDisposition } from './parse-disposition';
import type { FindingThread } from './read-pull-request-state';

// the typed replies of each finding thread as dispositions, oldest first; a reply whose first line is
// free text is none; whether an author owns the repo comes from their admin permission on it
export async function readThreadDispositions(
  client: GitHubClient,
  pr: PullRequestRef,
  threads: readonly FindingThread[],
): Promise<Disposition[]> {
  const owners = new Map<string, Promise<boolean>>();

  const dispositions: Disposition[] = [];

  for (const thread of threads) {
    for (const reply of thread.replies) {
      const parsed = parseDisposition(reply.body);

      if (parsed === null) {
        continue;
      }

      const isOwner = owners.get(reply.author) ?? readIsRepoOwner(client, pr, reply.author);

      owners.set(reply.author, isOwner);

      dispositions.push({
        findingID: thread.marker.id,
        kind: parsed.kind,
        value: parsed.value,
        author: reply.author,
        authorIsOwner: await isOwner,
        source: 'github',
        at: reply.at,
      });
    }
  }

  return dispositions.toSorted((left, right) => left.at.localeCompare(right.at));
}

async function readIsRepoOwner(
  client: GitHubClient,
  pr: PullRequestRef,
  login: string,
): Promise<boolean> {
  const response = await client.request(
    'GET /repos/{owner}/{repo}/collaborators/{username}/permission',
    { owner: pr.owner, repo: pr.repo, username: login },
  );

  return response.data.permission === 'admin';
}
