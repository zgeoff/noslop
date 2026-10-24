import type { ReadRemoteFile } from '@noslop/config';
import type { GitHubConnection } from './create-github-connection';

export interface GitHubFileReaderOptions {
  loadConnection: () => Promise<GitHubConnection>;
}

export function createGitHubFileReader(options: GitHubFileReaderOptions): ReadRemoteFile {
  return async (location) => {
    const connection = await options.loadConnection();

    const client = connection.client;

    try {
      const response = await client.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: location.owner,
        repo: location.repo,
        path: location.path,
        ...(location.ref === null ? {} : { ref: location.ref }),
      });

      const data = response.data;

      if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
        throw new Error(`${location.owner}/${location.repo}/${location.path} is not a file`);
      }

      return Buffer.from(data.content, 'base64').toString('utf8');
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        error.status === 404
      ) {
        return null;
      }

      throw error;
    }
  };
}
