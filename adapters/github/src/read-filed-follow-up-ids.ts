import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection } from './create-github-connection';
import { followUpMarkerSchema } from './follow-up-marker';
import { parseMarker } from './parse-marker';
import { readAllPages } from './read-all-pages';

export async function readFiledFollowUpIDs(
  connection: GitHubConnection,
  pr: PullRequestRef,
): Promise<Set<string>> {
  const issues = await readAllPages(async (page, perPage) => {
    const response = await connection.client.request('GET /repos/{owner}/{repo}/issues', {
      owner: pr.owner,
      repo: pr.repo,
      state: 'all',
      page,
      per_page: perPage,
    });

    return response.data;
  });

  return new Set(
    issues.flatMap((issue) => {
      const isOwn = connection.appLogin !== null && issue.user?.login === connection.appLogin;

      const marker = isOwn
        ? parseMarker('follow-up', followUpMarkerSchema, issue.body ?? '')
        : null;

      return marker?.pullRequest === pr.number ? [marker.id] : [];
    }),
  );
}
