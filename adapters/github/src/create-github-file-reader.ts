import type { ReadRemoteFile } from '@noslop/config';
import { match } from 'ts-pattern';
import type { GitHubConnection } from './create-github-connection';
import { readGitHubEntry } from './read-github-entry';

export interface GitHubFileReaderOptions {
  loadConnection: () => Promise<GitHubConnection>;
}

export function createGitHubFileReader(options: GitHubFileReaderOptions): ReadRemoteFile {
  return async (location) => {
    const connection = await options.loadConnection();
    const entry = await readGitHubEntry(connection, location);

    return match(entry)
      .with({ kind: 'file' }, (file) => file.text)
      .with({ kind: 'missing' }, () => null)
      .with({ kind: 'link' }, { kind: 'folder' }, () => {
        throw new Error(`${location.owner}/${location.repo}/${location.path} is not a file`);
      })
      .exhaustive();
  };
}
