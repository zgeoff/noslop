import { isAbsolute, relative, sep } from 'node:path';
import type { ReadLocalFile, ReadRemoteFile } from '@noslop/config';
import { loadConfig } from '@noslop/config';
import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection } from '@noslop/github';
import { createGitHubFileReader } from '@noslop/github';

const BASE_BRANCH_DIR = '/base-branch';

export function loadCommitConfig(
  loadConnection: () => Promise<GitHubConnection>,
  pr: PullRequestRef,
  commit: string,
): ReturnType<typeof loadConfig> {
  const readRemoteFile = createGitHubFileReader({ loadConnection });

  return loadConfig({
    repoDir: BASE_BRANCH_DIR,
    readRemoteFile,
    readLocalFile: makeCommitFileReader(readRemoteFile, pr, commit),
  });
}

function makeCommitFileReader(
  readRemoteFile: ReadRemoteFile,
  pr: PullRequestRef,
  commit: string,
): ReadLocalFile {
  return (path) => {
    const inner = relative(BASE_BRANCH_DIR, path);

    if (inner === '' || isAbsolute(inner) || inner.split(sep)[0] === '..') {
      return Promise.resolve(null);
    }

    return readRemoteFile({
      kind: 'github',
      owner: pr.owner,
      repo: pr.repo,
      path: inner.split(sep).join('/'),
      ref: commit,
    });
  };
}
