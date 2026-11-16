import type { GithubLocation } from '@noslop/config';
import type { GitHubConnection } from './create-github-connection';

export type GitHubEntry =
  | { kind: 'file'; text: string }
  | { kind: 'link'; target: string }
  | { kind: 'missing' };

// The contents API follows a symlink whose target is a file in the repo and answers with that file.
// It answers with the link itself only for a target that is not one, such as a path outside the repo.
export async function readGitHubEntry(
  connection: GitHubConnection,
  location: GithubLocation,
): Promise<GitHubEntry> {
  try {
    const response = await connection.client.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: location.owner,
      repo: location.repo,
      path: location.path,
      ...(location.ref === null ? {} : { ref: location.ref }),
    });

    const data = response.data;

    if (!Array.isArray(data) && data.type === 'file' && 'content' in data) {
      return { kind: 'file', text: Buffer.from(data.content, 'base64').toString('utf8') };
    }

    if (!Array.isArray(data) && data.type === 'symlink' && 'target' in data) {
      return { kind: 'link', target: data.target };
    }

    throw new Error(`${location.owner}/${location.repo}/${location.path} is not a file`);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) {
      return { kind: 'missing' };
    }

    throw error;
  }
}
