import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection } from './create-github-connection';

// the closing keywords GitHub reads in a pull request body, before an issue of the same repo
const LINKED_ISSUE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(?<number>\d+)\b/iu;

// the issue a pull request body links with a closing keyword, as its number, title and body for the
// intent lens; null when the body links none or the issue does not exist
export async function readLinkedIssue(
  connection: GitHubConnection,
  pr: PullRequestRef,
  body: string,
): Promise<string | null> {
  const number = LINKED_ISSUE.exec(body)?.groups?.['number'];

  if (number === undefined) {
    return null;
  }

  try {
    const response = await connection.client.request(
      'GET /repos/{owner}/{repo}/issues/{issue_number}',
      { owner: pr.owner, repo: pr.repo, issue_number: Number(number) },
    );

    return `#${number} ${response.data.title}\n\n${response.data.body ?? ''}`.trim();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) {
      return null;
    }

    throw error;
  }
}
