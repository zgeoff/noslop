import { isAbsolute, relative, sep } from 'node:path';
import type { ReadLocalFile, ReadRemoteFile } from '@noslop/config';
import { loadConfig } from '@noslop/config';
import type { PullRequestRef } from '@noslop/contract';
import type { GitHubConnection } from '@noslop/github';
import { createGitHubFileReader } from '@noslop/github';

// the folder the base branch's files stand at while its config loads with no checkout; the hash
// takes each local rules path relative to it, as it takes one relative to a checkout
const BASE_BRANCH_DIR = '/base-branch';

// the config of one commit of the pull request's repo, read through GitHub's contents API with no
// checkout, so a push during the load cannot mix the files of 2 commits
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

// a file inside the base branch's folder reads from the commit on GitHub; a file outside it, such as
// a rules file on the reviewer's own machine, reads as missing, because the relay cannot see it
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
